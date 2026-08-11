import { hasuraRequest } from "../services/hasura.js";
import { checkQuota, incrementQuota } from "../services/quota.js";
import { getWorkflowAuthorization } from "../services/authorization.js";
import { executeStep } from "./executeStep.js";

const MAX_STEP_EXECUTIONS = 100;

function appError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function loadWorkflow(workflowId) {
  const data = await hasuraRequest(
    `query GetWorkflow($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) { id organization_id name }
    }`,
    { workflowId },
  );

  if (!data.workflows_by_pk) {
    throw appError("Workflow not found", "WORKFLOW_NOT_FOUND");
  }

  return data.workflows_by_pk;
}

async function loadSteps(workflowId) {
  const data = await hasuraRequest(
    `query GetWorkflowSteps($workflowId: uuid!) {
      workflow_steps(
        where: { workflow_id: { _eq: $workflowId } }
        order_by: { position: asc }
      ) {
        id workflow_id position name type config
      }
    }`,
    { workflowId },
  );

  const steps = data.workflow_steps || [];
  if (!steps.length) throw appError("Workflow has no steps", "WORKFLOW_HAS_NO_STEPS");
  return steps;
}

async function createRun({ workflowId, triggerType, userId }) {
  const data = await hasuraRequest(
    `mutation CreateWorkflowRun(
      $workflowId: uuid!
      $triggerType: String!
      $createdBy: uuid
      $createdAt: timestamptz!
      $startedAt: timestamptz!
    ) {
      insert_workflow_runs_one(object: {
        workflow_id: $workflowId
        trigger_type: $triggerType
        status: "queued"
        created_by: $createdBy
        created_at: $createdAt
        started_at: $startedAt
      }) { id workflow_id status trigger_type created_by started_at }
    }`,
    {
      workflowId,
      triggerType,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    },
  );

  const run = data.insert_workflow_runs_one;
  await hasuraRequest(
    `mutation StartWorkflowRun($runId: uuid!) {
      update_workflow_runs_by_pk(
        pk_columns: { id: $runId }
        _set: { status: "running" }
      ) { id status }
    }`,
    { runId: run.id },
  );

  return run;
}

async function loadPreviousOutputs(workflowRunId) {
  const data = await hasuraRequest(
    `query PreviousStepRuns($workflowRunId: uuid!) {
      step_runs(
        where: { workflow_run_id: { _eq: $workflowRunId } }
        order_by: { created_at: asc }
      ) {
        id workflow_step_id status output started_at completed_at
        workflow_step { position }
      }
    }`,
    { workflowRunId },
  );

  return data.step_runs || [];
}

export async function executeWorkflow({
  workflowId,
  userId = null,
  triggerType = "manual",
  initialInput = {},
  existingWorkflowRunId = null,
  startAfterPosition = null,
}) {
  let workflowRunId = existingWorkflowRunId;
  let currentStepRunId = null;
  let organizationId;
  let role = null;

  try {
    const workflow = await loadWorkflow(workflowId);
    organizationId = workflow.organization_id;

    if (triggerType === "webhook" || triggerType === "database_event" || triggerType === "scheduled") {
      role = "owner";
    } else {
      const authorization = await getWorkflowAuthorization(workflowId, userId);
      role = authorization.role;
      if (role !== "owner" && role !== "editor") {
        throw appError("You cannot trigger this workflow.", "WORKFLOW_TRIGGER_FORBIDDEN");
      }
    }

    if (!existingWorkflowRunId) {
      await checkQuota(organizationId);
      const run = await createRun({ workflowId, triggerType, userId });
      workflowRunId = run.id;
    } else {
      const runData = await hasuraRequest(
        `query GetRunForResume($runId: uuid!) {
          workflow_runs_by_pk(id: $runId) { id workflow_id status }
        }`,
        { runId: existingWorkflowRunId },
      );
      const run = runData.workflow_runs_by_pk;
      if (!run || run.workflow_id !== workflowId) throw appError("Workflow run not found", "RUN_NOT_FOUND");
      if (run.status !== "paused") throw appError("Workflow run is not paused", "INVALID_APPROVAL_STATE");

      await hasuraRequest(
        `mutation ResumeWorkflowRun($runId: uuid!, $startedAt: timestamptz!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $runId }
            _set: { status: "running", error: null, started_at: $startedAt, completed_at: null }
          ) { id status }
        }`,
        { runId: existingWorkflowRunId, startedAt: new Date().toISOString() },
      );
    }

    const steps = await loadSteps(workflowId);
    const context = {
      organizationId,
      workflowId,
      workflowRunId,
      userId,
      role,
      previousOutput: initialInput,
      outputs: {},
      workflowSteps: steps,
    };

    let currentInput = initialInput;

    if (existingWorkflowRunId) {
      const previousRuns = await loadPreviousOutputs(workflowRunId);
      for (const run of previousRuns) {
        if (run.status === "completed" || run.status === "paused") {
          context.outputs[run.workflow_step_id] = run.output;
          if (run.output !== null && run.output !== undefined) currentInput = run.output;
        }
      }
    }

    let index = 0;
    if (startAfterPosition !== null && startAfterPosition !== undefined) {
      const nextIndex = steps.findIndex((step) => step.position > Number(startAfterPosition));
      index = nextIndex === -1 ? steps.length : nextIndex;
    }

    let executions = 0;
    while (index < steps.length) {
      executions += 1;
      if (executions > MAX_STEP_EXECUTIONS) {
        throw appError("Workflow exceeded the maximum step execution limit", "WORKFLOW_LOOP_LIMIT");
      }

      const step = steps[index];

      // Sensitive step types are configuration-time permissions. Once a workflow
      // is saved by an Owner, an authorized Editor may execute/approve that
      // workflow just like any other workflow. Hasura protects who may add or
      // modify those sensitive definitions.
      const stepRunData = await hasuraRequest(
        `mutation CreateStepRun(
          $workflowRunId: uuid!
          $workflowStepId: uuid!
          $input: jsonb!
          $startedAt: timestamptz!
        ) {
          insert_step_runs_one(object: {
            workflow_run_id: $workflowRunId
            workflow_step_id: $workflowStepId
            status: "running"
            input: $input
            attempt_count: 0
            started_at: $startedAt
          }) { id }
        }`,
        {
          workflowRunId,
          workflowStepId: step.id,
          input: currentInput ?? {},
          startedAt: new Date().toISOString(),
        },
      );

      currentStepRunId = stepRunData.insert_step_runs_one.id;
      context.stepRunId = currentStepRunId;

      let result;
      try {
        result = await executeStep({ step, input: currentInput, context });
      } catch (error) {
        error.attemptCount = Number(error.attemptCount || 1);
        throw error;
      }

      const attemptCount = Number(result.attemptCount || 1);

      if (result.status === "paused") {
        await hasuraRequest(
          `mutation PauseStep($stepRunId: uuid!, $output: jsonb!, $attemptCount: Int!) {
            update_step_runs_by_pk(
              pk_columns: { id: $stepRunId }
              _set: { status: "paused", output: $output, attempt_count: $attemptCount }
            ) { id status }
          }`,
          { stepRunId: currentStepRunId, output: result.output ?? {}, attemptCount },
        );

        await hasuraRequest(
          `mutation PauseWorkflow($workflowRunId: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $workflowRunId }
              _set: { status: "paused" }
            ) { id status }
          }`,
          { workflowRunId },
        );

        return {
          success: true,
          status: "paused",
          workflowRunId,
          stepRunId: currentStepRunId,
          message: result.output?.message || "Workflow is waiting for approval.",
        };
      }

      await hasuraRequest(
        `mutation CompleteStep(
          $stepRunId: uuid!
          $output: jsonb!
          $attemptCount: Int!
          $completedAt: timestamptz!
        ) {
          update_step_runs_by_pk(
            pk_columns: { id: $stepRunId }
            _set: {
              status: "completed"
              output: $output
              attempt_count: $attemptCount
              completed_at: $completedAt
            }
          ) { id status }
        }`,
        {
          stepRunId: currentStepRunId,
          output: result.output ?? {},
          attemptCount,
          completedAt: new Date().toISOString(),
        },
      );

      context.previousOutput = result.output ?? null;
      context.outputs[step.id] = result.output ?? null;
      currentInput = result.output ?? null;

      if (step.type === "conditional_branch") {
        const nextPosition = result.output?.result ? step.config?.true_next_position : step.config?.false_next_position;
        if (nextPosition !== undefined && nextPosition !== null) {
          const nextIndex = steps.findIndex((candidate) => candidate.position === Number(nextPosition));
          if (nextIndex !== -1) {
            index = nextIndex;
            continue;
          }
        }
      }

      index += 1;
    }

    await hasuraRequest(
      `mutation CompleteWorkflow($workflowRunId: uuid!, $completedAt: timestamptz!) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $workflowRunId }
          _set: { status: "completed", completed_at: $completedAt, error: null }
        ) { id status completed_at }
      }`,
      { workflowRunId, completedAt: new Date().toISOString() },
    );

    try {
      await incrementQuota(organizationId);
    } catch (quotaError) {
      // The run is already durably completed. Do not turn a successful
      // workflow into a failed workflow because usage accounting failed.
      console.error("[QUOTA] Failed to increment completed-run usage", quotaError);
    }

    return { success: true, status: "completed", workflowRunId };
  } catch (error) {
    console.error("[WORKFLOW ERROR]", error);

    if (workflowRunId) {
      const errorMessage = error?.message || "Workflow execution failed";
      if (currentStepRunId) {
        try {
          await hasuraRequest(
            `mutation FailStep($stepRunId: uuid!, $error: String!, $attemptCount: Int!, $completedAt: timestamptz!) {
              update_step_runs_by_pk(
                pk_columns: { id: $stepRunId }
                _set: { status: "failed", error: $error, attempt_count: $attemptCount, completed_at: $completedAt }
              ) { id status }
            }`,
            {
              stepRunId: currentStepRunId,
              error: errorMessage,
              attemptCount: Number(error?.attemptCount || 1),
              completedAt: new Date().toISOString(),
            },
          );
        } catch (updateError) {
          console.error("[WORKFLOW ERROR] Failed to persist step failure", updateError);
        }
      }

      try {
        await hasuraRequest(
          `mutation FailWorkflow($workflowRunId: uuid!, $error: String!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $workflowRunId }
              _set: { status: "failed", error: $error }
            ) { id status }
          }`,
          { workflowRunId, error: errorMessage },
        );
      } catch (updateError) {
        console.error("[WORKFLOW ERROR] Failed to persist workflow failure", updateError);
      }
    }

    throw error;
  }
}

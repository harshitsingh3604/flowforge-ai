import { hasuraRequest } from "../services/hasura.js";
import { checkQuota, incrementQuota } from "../services/quota.js";
import { getWorkflowAuthorization } from "../services/authorization.js";
import { executeStep } from "./executeStep.js";

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
  let workflow;

  try {
    // Human-triggered runs must be owner/editor members of the workflow org.
    if (triggerType === "webhook") {
      const data = await hasuraRequest(
        `
        query GetWebhookWorkflow($workflowId: uuid!) {
          workflows_by_pk(id: $workflowId) {
            id
            organization_id
          }
        }
      `,
        { workflowId },
      );

      workflow = data.workflows_by_pk;
      if (!workflow) throw new Error("WORKFLOW_NOT_FOUND");
      organizationId = workflow.organization_id;
      // Webhook execution is authorized by the validated webhook secret.
      role = "owner";
    } else {
      const authorization = await getWorkflowAuthorization(workflowId, userId);
      workflow = authorization.workflow;
      organizationId = authorization.organizationId;
      role = authorization.role;

      if (role !== "owner" && role !== "editor") {
        const error = new Error("You cannot trigger this workflow.");
        error.code = "WORKFLOW_TRIGGER_FORBIDDEN";
        throw error;
      }
    }

    // Quota is checked only when a brand-new run is created.
    if (!existingWorkflowRunId) {
      await checkQuota(organizationId);
    }

    // Create a run only once. Approval resumes reuse the paused run.
    if (!workflowRunId) {
      const runData = await hasuraRequest(
        `
        mutation CreateWorkflowRun(
          $workflowId: uuid!
          $triggerType: String!
          $createdBy: uuid
          $startedAt: timestamptz!
        ) {
            insert_workflow_runs_one(
              object: {
                workflow_id: $workflowId
                trigger_type: $triggerType
                status: "running"
                created_by: $createdBy
                started_at: $startedAt
              }
            ){
            id
            workflow_id
            status
            trigger_type
            created_by
            started_at
          }
        }
      `,
        {
          workflowId,
          triggerType,
          createdBy: userId,
          startedAt: new Date().toISOString(),
        },
      );

      workflowRunId = runData.insert_workflow_runs_one.id;
    } else {
      await hasuraRequest(
        `
        mutation ResumeWorkflowRun($workflowRunId: uuid!) {
          update_workflow_runs_by_pk(
            pk_columns: { id: $workflowRunId }
            _set: { status: "running", error: null }
          ) { id status }
        }
      `,
        { workflowRunId },
      );
    }

    const stepsData = await hasuraRequest(
      `
      query GetWorkflowSteps($workflowId: uuid!) {
        workflow_steps(
          where: { workflow_id: { _eq: $workflowId } }
          order_by: { position: asc }
        ) {
          id
          workflow_id
          position
          name
          type
          config
        }
      }
    `,
      { workflowId },
    );

    const steps = stepsData.workflow_steps || [];
    if (!steps.length) throw new Error("WORKFLOW_HAS_NO_STEPS");

    // Rebuild context when resuming from persisted step_runs.
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
      const previousData = await hasuraRequest(
        `
        query GetPreviousStepRuns($workflowRunId: uuid!) {
      step_runs(
        where: { workflow_run_id: { _eq: $workflowRunId } }
        order_by: { started_at: asc }
      ) {
        workflow_step_id
        output
      }
    }
      `,
        { workflowRunId },
      );

      for (const run of previousData.step_runs || []) {
        context.outputs[run.workflow_step_id] = run.output;
        currentInput = run.output ?? currentInput;
      }
    }

    let index = 0;
    if (startAfterPosition !== null && startAfterPosition !== undefined) {
      const nextIndex = steps.findIndex(
        (s) => s.position > Number(startAfterPosition),
      );
      index = nextIndex === -1 ? steps.length : nextIndex;
    }

    while (index < steps.length) {
      const step = steps[index];

      // Step-level restrictions are primarily enforced when the workflow is edited:
      // only owners can add db_write/notify/webhook steps. Once a workflow is saved,
      // an authorized owner/editor run may execute its configured steps.

      if (
          (step.type === "db_write" || step.type === "notify") &&
          role !== "owner"
        ) {
          const error = new Error(
            `Owner permissions required`
          );

          error.code = "STEP_FORBIDDEN";

          throw error;
        }

      const stepRunData = await hasuraRequest(
        
        `
        mutation CreateStepRun(
          $workflowRunId: uuid!
          $workflowStepId: uuid!
          $input: jsonb!
          $startedAt: timestamptz!
        ) {
          insert_step_runs_one(
            object: {
                workflow_run_id: $workflowRunId
                workflow_step_id: $workflowStepId
                status: "running"
                input: $input
                attempt_count: 0
                started_at: $startedAt
            }
          ) { id }
        }
      `,
        {
          workflowRunId,
          workflowStepId: step.id,
          input: currentInput ?? {},
          startedAt: new Date().toISOString(),
        },
      );

      const stepRunId = stepRunData.insert_step_runs_one.id;
      currentStepRunId = stepRunId;
      context.stepRunId = stepRunId;

      const result = await executeStep({ step, input: currentInput, context });
      const attemptCount = result.attemptCount || 1;

      if (result.status === "paused") {
        await hasuraRequest(
          `
          mutation PauseStep($stepRunId: uuid!, $output: jsonb!, $attemptCount: Int!) {
            update_step_runs_by_pk(
              pk_columns: { id: $stepRunId }
              _set: { status: "paused", output: $output, attempt_count: $attemptCount }
            ) { id status }
          }
        `,
          { stepRunId, output: result.output ?? {}, attemptCount },
        );

        await hasuraRequest(
          `
          mutation PauseWorkflow($workflowRunId: uuid!) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $workflowRunId }
              _set: { status: "paused" }
            ) { id status }
          }
        `,
          { workflowRunId },
        );

        return {
          success: true,
          status: "paused",
          workflowRunId,
          stepRunId,
          message:
            result.output?.message || "Workflow is waiting for approval.",
        };
      }

      await hasuraRequest(
        `
        mutation CompleteStep($stepRunId: uuid!,
          $output: jsonb!,
          $attemptCount: Int!,
          $completedAt: timestamptz!) {
          update_step_runs_by_pk(
            pk_columns: { id: $stepRunId }
            _set: {
              status: "completed"
              output: $output
              attempt_count: $attemptCount
              completed_at: $completedAt
            }
          ) { id status }
        }
      `,
        {
          stepRunId,
          output: result.output ?? {},
          attemptCount,
          completedAt: new Date().toISOString(),
        },
      );

      context.previousOutput = result.output ?? null;
      context.outputs[step.id] = result.output ?? null;
      currentInput = result.output ?? null;

      if (step.type === "conditional_branch") {
        const nextPosition = result.output?.result
          ? step.config?.true_next_position
          : step.config?.false_next_position;

        if (typeof nextPosition === "number") {
          const nextIndex = steps.findIndex((s) => s.position === nextPosition);
          if (nextIndex !== -1) {
            index = nextIndex;
            continue;
          }
        }
      }

      index += 1;
    }

    await hasuraRequest(
      `
      mutation CompleteWorkflow(
        $workflowRunId: uuid!
        $completedAt: timestamptz!
      ) {
        update_workflow_runs_by_pk(
          pk_columns: { id: $workflowRunId }
          _set: {
            status: "completed"
            completed_at: $completedAt
          }
        ) {
          id
          status
          completed_at
        }
      }
    `,
      { workflowRunId, completedAt: new Date().toISOString(), },
    );

    // Count a run exactly once, when it actually completes.
    await incrementQuota(organizationId);

    return { success: true, status: "completed", workflowRunId };
  } catch (error) {
    console.error("[WORKFLOW ERROR]", error);

    if (workflowRunId) {
      if (currentStepRunId) {
        try {
          await hasuraRequest(
            `
            mutation FailStep(
              $stepRunId: uuid!
              $error: String!
              $attemptCount: Int!
              $completedAt: timestamptz!
            ) {
              update_step_runs_by_pk(
                pk_columns: { id: $stepRunId }
                _set: {
                  status: "failed"
                  error: $error
                  attempt_count: $attemptCount
                  completed_at: $completedAt
                }
              ) {
                id
                status
              }
            }
          `,
            {
              stepRunId: currentStepRunId,
              error: error.message || "Step failed",
              attemptCount: error.attemptCount || 1,
              completedAt: new Date().toISOString(),
            },
          );
        } catch (e) {
          console.error("[STEP FAILURE UPDATE ERROR]", e);
        }
      }

      try {
        await hasuraRequest(
          `
          mutation FailWorkflow(
            $workflowRunId: uuid!
            $error: String!
            $completedAt: timestamptz!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: { id: $workflowRunId }
              _set: {
                status: "failed"
                error: $error
                completed_at: $completedAt
              }
            ) {
              id
              status
            }
          }
        `,
          { workflowRunId, error: error.message || "Workflow failed", completedAt: new Date().toISOString() },
        );
      } catch (e) {
        console.error("[WORKFLOW FAILURE UPDATE ERROR]", e);
      }
    }

    throw error;
  }
}

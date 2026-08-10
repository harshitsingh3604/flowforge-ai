import { hasuraRequest } from "../services/hasura.js";
import { checkQuota, incrementQuota } from "../services/quota.js";
import { executeStep } from "./executeStep.js";

/**
 * Execute a workflow from the beginning.
 *
 * Flow:
 *
 * Authorization
 *      ↓
 * Quota
 *      ↓
 * Create workflow_run
 *      ↓
 * Load workflow steps
 *      ↓
 * Execute steps
 *      ↓
 * Approval gate → PAUSED
 *      ↓
 * All steps complete → COMPLETED
 *      ↓
 * Any unrecoverable error → FAILED
 */
export async function executeWorkflow({
  workflowId,
  userId,
  triggerType = "manual"
}) {
  let workflowRunId = null;
  let currentStepRunId = null;

  try {
    // ============================================================
    // 1. AUTHORIZATION
    // ============================================================

    const workflowQuery = `
      query GetWorkflowForExecution(
        $workflowId: uuid!
      ) {
        workflows_by_pk(id: $workflowId) {
          id
          name
          organization_id

          organization {
            id
            name

            org_members(
              where: {
                user_id: { _eq: $userId }
              }
              limit: 1
            ) {
              id
              user_id
              role
            }
          }

          workflow_steps(
            order_by: {
              position: asc
            }
          ) {
            id
            workflow_id
            position
            name
            type
            config
          }
        }
      }
    `;

    const workflowData = await hasuraRequest(
      workflowQuery,
      {
        workflowId,
        userId
      }
    );

    const workflow =
      workflowData.workflows_by_pk;

    // Workflow doesn't exist
    if (!workflow) {
      const error = new Error(
        "Workflow not found"
      );

      error.code = "WORKFLOW_NOT_FOUND";

      throw error;
    }

    // ============================================================
    // 2. CHECK ORGANIZATION MEMBERSHIP
    // ============================================================

    const members =
      workflow.organization?.org_members || [];

    const membership = members[0];

    if (!membership) {
      const error = new Error(
        "You are not a member of this organization"
      );

      error.code = "ORG_ACCESS_DENIED";

      throw error;
    }

    const role = membership.role;

    // Viewer cannot trigger workflow
    if (
      role !== "owner" &&
      role !== "editor"
    ) {
      const error = new Error(
        "Only owners and editors can trigger workflows"
      );

      error.code = "WORKFLOW_TRIGGER_FORBIDDEN";

      throw error;
    }

    const organizationId =
      workflow.organization_id;

    // ============================================================
    // 3. CHECK QUOTA
    // ============================================================

    await checkQuota(organizationId);

    // IMPORTANT:
    // We check quota BEFORE creating workflow_run.
    //
    // If quota is exhausted:
    //
    // checkQuota()
    //      ↓
    // QUOTA_EXCEEDED
    //      ↓
    // STOP
    //
    // No workflow_run is created.

    // ============================================================
    // 4. CREATE WORKFLOW RUN
    // ============================================================

    const createRunMutation = `
      mutation CreateWorkflowRun(
        $workflowId: uuid!
        $triggerType: String!
        $createdBy: uuid!
      ) {
        insert_workflow_runs_one(
          object: {
            workflow_id: $workflowId
            trigger_type: $triggerType
            status: "running"
            created_by: $createdBy
            started_at: "now()"
          }
        ) {
          id
          workflow_id
          status
          trigger_type
          started_at
        }
      }
    `;

    const runData = await hasuraRequest(
      createRunMutation,
      {
        workflowId,
        triggerType,
        createdBy: userId
      }
    );

    const workflowRun =
      runData.insert_workflow_runs_one;

    workflowRunId = workflowRun.id;

    // ============================================================
    // 5. GET STEPS
    // ============================================================

    const steps =
      workflow.workflow_steps || [];

    if (steps.length === 0) {
      await updateWorkflowRun({
        workflowRunId,
        status: "completed"
      });

      await incrementQuota(organizationId);

      return {
        success: true,
        workflowRunId,
        status: "completed"
      };
    }

    // ============================================================
    // 6. EXECUTION CONTEXT
    // ============================================================

    const context = {
      organizationId,
      workflowId,
      workflowRunId,

      previousOutput: null,

      outputs: {}
    };

    // ============================================================
    // 7. EXECUTE STEPS IN ORDER
    // ============================================================

    let stepIndex = 0;

    while (stepIndex < steps.length) {
      const step = steps[stepIndex];

      // ----------------------------------------------------------
      // STEP-LEVEL PERMISSION CHECK
      // ----------------------------------------------------------

      if (
        step.type === "db_write" &&
        role !== "owner"
      ) {
        throw new Error(
          "Only organization owners can use db_write steps"
        );
      }

      if (
        step.type === "notify" &&
        role !== "owner"
      ) {
        throw new Error(
          "Only organization owners can use notify steps"
        );
      }

      // ----------------------------------------------------------
      // CREATE STEP RUN
      // ----------------------------------------------------------

      const input =
        context.previousOutput;

      const createStepRunMutation = `
        mutation CreateStepRun(
          $workflowRunId: uuid!
          $workflowStepId: uuid!
          $input: jsonb
        ) {
          insert_step_runs_one(
            object: {
              workflow_run_id: $workflowRunId
              workflow_step_id: $workflowStepId
              status: "queued"
              input: $input
              attempt_count: 0
            }
          ) {
            id
            workflow_run_id
            workflow_step_id
            status
          }
        }
      `;

      const stepRunData =
        await hasuraRequest(
          createStepRunMutation,
          {
            workflowRunId,
            workflowStepId: step.id,
            input: input ?? null
          }
        );

      const stepRun =
        stepRunData.insert_step_runs_one;

      currentStepRunId = stepRun.id;

      // ----------------------------------------------------------
      // MARK STEP RUN AS RUNNING
      // ----------------------------------------------------------

      await updateStepRun({
        stepRunId: stepRun.id,
        status: "running",
        startedAt: true
      });

      // Put current step_run ID into context.
      //
      // dbWrite.js and notify.js need this ID.
      context.stepRunId = stepRun.id;

      // ----------------------------------------------------------
      // EXECUTE STEP
      // ----------------------------------------------------------

      try {
        const result =
          await executeStep({
            step,
            input,
            context
          });

        // --------------------------------------------------------
        // APPROVAL GATE
        // --------------------------------------------------------

        if (result.status === "paused") {
          await updateStepRun({
            stepRunId: stepRun.id,
            status: "paused",
            output: result.output,
            attemptCount:
              result.attemptCount || 1
          });

          await updateWorkflowRun({
            workflowRunId,
            status: "paused"
          });

          return {
            success: true,

            workflowRunId,

            stepRunId: stepRun.id,

            status: "paused",

            message:
              result.output?.message ||
              "Workflow is waiting for approval."
          };
        }

        // --------------------------------------------------------
        // NORMAL STEP COMPLETED
        // --------------------------------------------------------

        await updateStepRun({
          stepRunId: stepRun.id,
          status: "completed",
          output: result.output,
          attemptCount:
            result.attemptCount || 1,
          completedAt: true
        });

        // Save output for next step
        context.previousOutput =
          result.output;

        context.outputs[step.id] =
          result.output;

        // --------------------------------------------------------
        // CONDITIONAL BRANCH
        // --------------------------------------------------------

        if (
          step.type ===
          "conditional_branch"
        ) {
          const branchResult =
            result.output?.result;

          if (
            branchResult === true &&
            step.config?.true_next_position
          ) {
            const nextPosition =
              step.config.true_next_position;

            const nextIndex =
              steps.findIndex(
                (s) =>
                  s.position === nextPosition
              );

            if (nextIndex !== -1) {
              stepIndex = nextIndex;

              continue;
            }
          }

          if (
            branchResult === false &&
            step.config?.false_next_position
          ) {
            const nextPosition =
              step.config.false_next_position;

            const nextIndex =
              steps.findIndex(
                (s) =>
                  s.position === nextPosition
              );

            if (nextIndex !== -1) {
              stepIndex = nextIndex;

              continue;
            }
          }
        }

        // Next normal step
        stepIndex++;
      } catch (stepError) {
        // --------------------------------------------------------
        // STEP FAILED
        // --------------------------------------------------------

        console.error(
          `Step ${step.id} failed:`,
          stepError
        );

        await updateStepRun({
          stepRunId: stepRun.id,
          status: "failed",
          error: stepError.message,

          // Retry helper returns attemptCount.
          //
          // If it isn't available because the executor threw,
          // use 2 as the maximum configured attempt count.
          attemptCount: 2,

          completedAt: false
        });

        throw stepError;
      }
    }

    // ============================================================
    // 8. WORKFLOW COMPLETED
    // ============================================================

    await updateWorkflowRun({
      workflowRunId,
      status: "completed",
      completedAt: true
    });

    // Increment quota ONLY after successful completion.
    await incrementQuota(organizationId);

    return {
      success: true,

      workflowRunId,

      status: "completed"
    };
  } catch (error) {
    // ============================================================
    // 9. WORKFLOW FAILED
    // ============================================================

    console.error(
      "Workflow execution failed:",
      error
    );

    // If workflow_run was already created,
    // mark it as failed.
    if (workflowRunId) {
      try {
        await updateWorkflowRun({
          workflowRunId,
          status: "failed",
          error: error.message,
          completedAt: true
        });
      } catch (updateError) {
        console.error(
          "Failed to update workflow run:",
          updateError
        );
      }
    }

    throw error;
  }
}

/**
 * Update workflow_runs
 */
async function updateWorkflowRun({
  workflowRunId,
  status,
  error = null,
  completedAt = false
}) {
  const mutation = `
    mutation UpdateWorkflowRun(
      $id: uuid!
      $status: String!
      $error: String
      $completedAt: timestamptz
    ) {
      update_workflow_runs_by_pk(
        pk_columns: {
          id: $id
        }
        _set: {
          status: $status
          error: $error
          completed_at: $completedAt
        }
      ) {
        id
        status
        error
        completed_at
      }
    }
  `;

  await hasuraRequest(
    mutation,
    {
      id: workflowRunId,
      status,
      error,
      completedAt:
        completedAt
          ? new Date().toISOString()
          : null
    }
  );
}

/**
 * Update step_runs
 */
async function updateStepRun({
  stepRunId,
  status,
  output = undefined,
  error = undefined,
  attemptCount = undefined,
  startedAt = false,
  completedAt = false
}) {
  const set = {
    status
  };

  if (output !== undefined) {
    set.output = output;
  }

  if (error !== undefined) {
    set.error = error;
  }

  if (attemptCount !== undefined) {
    set.attempt_count = attemptCount;
  }

  if (startedAt) {
    set.started_at =
      new Date().toISOString();
  }

  if (completedAt) {
    set.completed_at =
      new Date().toISOString();
  }

  const mutation = `
    mutation UpdateStepRun(
      $id: uuid!
      $set: step_runs_set_input!
    ) {
      update_step_runs_by_pk(
        pk_columns: {
          id: $id
        }
        _set: $set
      ) {
        id
        status
        attempt_count
        started_at
        completed_at
        error
      }
    }
  `;

  await hasuraRequest(
    mutation,
    {
      id: stepRunId,
      set
    }
  );
}
import { hasuraRequest } from "../services/hasura.js";
import { checkQuota } from "../services/quota.js";
import { getWorkflowAuthorization } from "../services/authorization.js";
import { executeStep } from "./executeStep.js";

/**
 * Execute a workflow from beginning to end.
 *
 * Important:
 * - Authorization happens before execution.
 * - Quota is checked before creating a workflow run.
 * - Every step gets its own step_run.
 * - approval_gate pauses the workflow and returns immediately.
 * - Errors mark both step_run and workflow_run as failed.
 */
export async function executeWorkflow({
  workflowId,
  userId,
  triggerType = "manual",
  initialInput = {},
}) {
  let workflowRunId = null;
  let currentStepRunId = null;

  try {
    // =========================================================
    // 1. AUTHORIZATION
    // =========================================================

    await getWorkflowAuthorization(workflowId, userId);

    const { workflow, organizationId, role } = authorization;

    if (!workflow) {
      throw new Error("WORKFLOW_NOT_FOUND");
    }

    // Owner and editor can trigger workflows.
    // Viewer cannot.
    if (role !== "owner" && role !== "editor") {
      const error = new Error("FORBIDDEN: You cannot trigger this workflow.");

      error.code = "FORBIDDEN";

      throw error;
    }

    // =========================================================
    // 2. QUOTA CHECK
    // =========================================================

    await checkQuota(organizationId);

    // =========================================================
    // 3. CREATE WORKFLOW RUN
    // =========================================================

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
          created_by
          started_at
        }
      }
    `;

    const runData = await hasuraRequest(createRunMutation, {
      workflowId,
      triggerType,
      createdBy: userId,
    });

    const workflowRun = runData.insert_workflow_runs_one;

    workflowRunId = workflowRun.id;

    // =========================================================
    // 4. LOAD WORKFLOW STEPS
    // =========================================================

    const stepsQuery = `
      query GetWorkflowSteps(
        $workflowId: uuid!
      ) {
        workflow_steps(
          where: {
            workflow_id: {
              _eq: $workflowId
            }
          }
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
    `;

    const stepsData = await hasuraRequest(stepsQuery, {
      workflowId,
    });

    const steps = stepsData.workflow_steps || [];

    if (steps.length === 0) {
      throw new Error("WORKFLOW_HAS_NO_STEPS");
    }

    // =========================================================
    // 5. EXECUTION CONTEXT
    // =========================================================

    const context = {
      organizationId,

      workflowId,

      workflowRunId,

      userId,

      role,

      previousOutput: initialInput,

      outputs: {},
    };

    let currentInput = initialInput;

    // =========================================================
    // 6. EXECUTE STEPS IN ORDER
    // =========================================================

    let index = 0;

    while (index < steps.length) {
      const step = steps[index];

      // -------------------------------------------------------
      // Create step_run
      // -------------------------------------------------------

      const createStepRunMutation = `
        mutation CreateStepRun(
          $workflowRunId: uuid!
          $workflowStepId: uuid!
          $input: jsonb!
        ) {
          insert_step_runs_one(
            object: {
              workflow_run_id: $workflowRunId
              workflow_step_id: $workflowStepId
              status: "running"
              input: $input
              attempt_count: 0
              started_at: "now()"
            }
          ) {
            id
            workflow_run_id
            workflow_step_id
            status
            started_at
          }
        }
      `;

      const stepRunData = await hasuraRequest(createStepRunMutation, {
        workflowRunId,
        workflowStepId: step.id,
        input: currentInput ?? {},
      });

      const stepRun = stepRunData.insert_step_runs_one;

      currentStepRunId = stepRun.id;

      // Add current step information to context.
      context.stepRunId = stepRun.id;

      // -------------------------------------------------------
      // Step-level authorization
      // -------------------------------------------------------

      if (step.type === "db_write" && role !== "owner") {
        throw new Error("FORBIDDEN: Only an owner can execute db_write steps.");
      }

      if (step.type === "notify" && role !== "owner") {
        throw new Error("FORBIDDEN: Only an owner can execute notify steps.");
      }

      // -------------------------------------------------------
      // Execute step
      // -------------------------------------------------------

      const result = await executeStep({
        step,
        input: currentInput,
        context,
      });

      // -------------------------------------------------------
      // Save attempt count
      // -------------------------------------------------------

      const attemptCount = result.attemptCount || 1;

      // -------------------------------------------------------
      // APPROVAL GATE
      // -------------------------------------------------------

      if (result.status === "paused") {
        const pauseStepMutation = `
          mutation PauseStepRun(
            $stepRunId: uuid!
            $output: jsonb!
            $attemptCount: Int!
          ) {
            update_step_runs_by_pk(
              pk_columns: {
                id: $stepRunId
              }
              _set: {
                status: "paused"
                output: $output
                attempt_count: $attemptCount
              }
            ) {
              id
              status
            }
          }
        `;

        await hasuraRequest(pauseStepMutation, {
          stepRunId: stepRun.id,
          output: result.output ?? {},
          attemptCount,
        });

        const pauseWorkflowMutation = `
          mutation PauseWorkflowRun(
            $workflowRunId: uuid!
          ) {
            update_workflow_runs_by_pk(
              pk_columns: {
                id: $workflowRunId
              }
              _set: {
                status: "paused"
              }
            ) {
              id
              status
            }
          }
        `;

        await hasuraRequest(pauseWorkflowMutation, {
          workflowRunId,
        });

        // IMPORTANT:
        // Do not wait here.
        // The HTTP/Action request finishes.
        // approveStep() will resume the workflow later.

        return {
          success: true,
          status: "paused",
          workflowRunId,
          stepRunId: stepRun.id,
          message:
            result.output?.message || "Workflow is waiting for approval.",
        };
      }

      // -------------------------------------------------------
      // Normal completed step
      // -------------------------------------------------------

      const completeStepMutation = `
        mutation CompleteStepRun(
          $stepRunId: uuid!
          $output: jsonb!
          $attemptCount: Int!
        ) {
          update_step_runs_by_pk(
            pk_columns: {
              id: $stepRunId
            }
            _set: {
              status: "completed"
              output: $output
              attempt_count: $attemptCount
              completed_at: "now()"
            }
          ) {
            id
            status
            output
            attempt_count
            completed_at
          }
        }
      `;

      await hasuraRequest(completeStepMutation, {
        stepRunId: stepRun.id,
        output: result.output ?? {},
        attemptCount,
      });

      // -------------------------------------------------------
      // Store previous output for next step
      // -------------------------------------------------------

      context.previousOutput = result.output ?? null;

      context.outputs[step.id] = result.output ?? null;

      currentInput = result.output ?? null;

      // -------------------------------------------------------
      // CONDITIONAL BRANCH
      // -------------------------------------------------------

      if (step.type === "conditional_branch") {
        const branchResult = result.output?.result;

        const truePosition = step.config?.true_next_position;

        const falsePosition = step.config?.false_next_position;

        let nextPosition;

        if (branchResult === true) {
          nextPosition = truePosition;
        } else {
          nextPosition = falsePosition;
        }

        if (typeof nextPosition === "number") {
          const nextIndex = steps.findIndex(
            (candidate) => candidate.position === nextPosition,
          );

          if (nextIndex !== -1) {
            index = nextIndex;

            continue;
          }
        }
      }

      // -------------------------------------------------------
      // Move to next step
      // -------------------------------------------------------

      index++;
    }

    // =========================================================
    // 7. WORKFLOW COMPLETED
    // =========================================================

    const completeWorkflowMutation = `
      mutation CompleteWorkflowRun(
        $workflowRunId: uuid!
      ) {
        update_workflow_runs_by_pk(
          pk_columns: {
            id: $workflowRunId
          }
          _set: {
            status: "completed"
            completed_at: "now()"
          }
        ) {
          id
          status
          completed_at
        }
      }
    `;

    await hasuraRequest(completeWorkflowMutation, {
      workflowRunId,
    });

    // =========================================================
    // 8. INCREMENT QUOTA
    // =========================================================

    await incrementQuota(organizationId);

    return {
      success: true,
      status: "completed",
      workflowRunId,
    };
  } catch (error) {
    console.error("[WORKFLOW ERROR]", error);

    // ---------------------------------------------------------
    // If workflow never started, don't try to update a run.
    // Example: authorization/quota failure.
    // ---------------------------------------------------------

    if (!workflowRunId) {
      throw error;
    }

    // ---------------------------------------------------------
    // Mark current step as failed
    // ---------------------------------------------------------

    if (currentStepRunId) {
      try {
        const failStepMutation = `
          mutation FailStepRun(
            $stepRunId: uuid!
            $error: String!
          ) {
            update_step_runs_by_pk(
              pk_columns: {
                id: $stepRunId
              }
              _set: {
                status: "failed"
                error: $error
                completed_at: "now()"
              }
            ) {
              id
              status
            }
          }
        `;

        await hasuraRequest(failStepMutation, {
          stepRunId: currentStepRunId,
          error: error.message || "Step execution failed",
        });
      } catch (stepError) {
        console.error("[STEP FAILURE UPDATE ERROR]", stepError);
      }
    }

    // ---------------------------------------------------------
    // Mark workflow as failed
    // ---------------------------------------------------------

    try {
      const failWorkflowMutation = `
        mutation FailWorkflowRun(
          $workflowRunId: uuid!
          $error: String!
        ) {
          update_workflow_runs_by_pk(
            pk_columns: {
              id: $workflowRunId
            }
            _set: {
              status: "failed"
              error: $error
              completed_at: "now()"
            }
          ) {
            id
            status
          }
        }
      `;

      await hasuraRequest(failWorkflowMutation, {
        workflowRunId,
        error: error.message || "Workflow execution failed",
      });
    } catch (workflowError) {
      console.error("[WORKFLOW FAILURE UPDATE ERROR]", workflowError);
    }

    throw error;
  }
}

/**
 * Increment organization quota after
 * successful workflow completion.
 *
 * This is intentionally atomic:
 *
 * quota_used < quota_limit
 *          ↓
 * quota_used + 1
 */
async function incrementQuota(organizationId) {
  const mutation = `
    mutation IncrementOrganizationQuota(
      $organizationId: uuid!
    ) {
      update_organizations(
        where: {
          id: {
            _eq: $organizationId
          }

          quota_used: {
            _lt: quota_limit
          }
        }

        _inc: {
          quota_used: 1
        }
      ) {
        affected_rows
      }
    }
  `;

  const result = await hasuraRequest(mutation, {
    organizationId,
  });

  if (result.update_organizations.affected_rows !== 1) {
    throw new Error("QUOTA_INCREMENT_FAILED");
  }
}

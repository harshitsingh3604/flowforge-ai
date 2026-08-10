import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

export async function approveStep({
  stepRunId,
  userId
}) {
  // ============================================================
  // 1. AUTHENTICATION
  // ============================================================

  if (!userId) {
    const error = new Error(
      "Authentication required"
    );

    error.code = "UNAUTHENTICATED";

    throw error;
  }

  if (!stepRunId) {
    const error = new Error(
      "step_run_id is required"
    );

    error.code = "INVALID_INPUT";

    throw error;
  }

  // ============================================================
  // 2. LOAD STEP + WORKFLOW + ORGANIZATION
  // ============================================================

  const query = `
    query GetStepForApproval(
      $stepRunId: uuid!
      $userId: uuid!
    ) {
      step_runs_by_pk(id: $stepRunId) {
        id
        status
        workflow_step_id
        approved_by
        approved_at

        workflow_step {
          id
          type
          workflow_id
          position
        }

        workflow_run {
          id
          workflow_id
          status

          workflow {
            id
            organization_id

            organization {
              id

              org_members(
                where: {
                  user_id: {
                    _eq: $userId
                  }
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
      }
    }
  `;

  const data =
    await hasuraRequest(
      query,
      {
        stepRunId,
        userId
      }
    );

  const stepRun =
    data.step_runs_by_pk;

  // ============================================================
  // 3. STEP EXISTS?
  // ============================================================

  if (!stepRun) {
    const error = new Error(
      "Step run not found"
    );

    error.code = "STEP_RUN_NOT_FOUND";

    throw error;
  }

  // ============================================================
  // 4. ORGANIZATION MEMBERSHIP
  // ============================================================

  const workflow =
    stepRun.workflow_run.workflow;

  const membership =
    workflow.organization
      ?.org_members?.[0];

  if (!membership) {
    const error = new Error(
      "You are not a member of this organization"
    );

    error.code =
      "ORG_ACCESS_DENIED";

    throw error;
  }

  // ============================================================
  // 5. OWNER / EDITOR CHECK
  // ============================================================

  if (
    membership.role !== "owner" &&
    membership.role !== "editor"
  ) {
    const error = new Error(
      "Only owners and editors can approve workflow steps"
    );

    error.code =
      "APPROVAL_FORBIDDEN";

    throw error;
  }

  // ============================================================
  // 6. IS THIS ACTUALLY AN APPROVAL GATE?
  // ============================================================

  if (
    stepRun.workflow_step.type !==
    "approval_gate"
  ) {
    const error = new Error(
      "This step is not an approval gate"
    );

    error.code =
      "NOT_APPROVAL_GATE";

    throw error;
  }

  // ============================================================
  // 7. IS THE STEP PAUSED?
  // ============================================================

  if (stepRun.status !== "paused") {
    const error = new Error(
      "Step is not waiting for approval"
    );

    error.code =
      "STEP_NOT_PAUSED";

    throw error;
  }

  // ============================================================
  // 8. IS THE WORKFLOW PAUSED?
  // ============================================================

  const workflowRun =
    stepRun.workflow_run;

  if (
    workflowRun.status !== "paused"
  ) {
    const error = new Error(
      "Workflow is not paused"
    );

    error.code =
      "WORKFLOW_NOT_PAUSED";

    throw error;
  }

  // ============================================================
  // 9. APPROVE STEP
  // ============================================================

  const approveMutation = `
    mutation ApproveStep(
      $stepRunId: uuid!
      $userId: uuid!
    ) {
      update_step_runs_by_pk(
        pk_columns: {
          id: $stepRunId
        }
        _set: {
          status: "completed"
          approved_by: $userId
          approved_at: "now()"
          completed_at: "now()"
        }
      ) {
        id
        status
        approved_by
        approved_at
      }
    }
  `;

  await hasuraRequest(
    approveMutation,
    {
      stepRunId,
      userId
    }
  );

  // ============================================================
  // 10. SET WORKFLOW BACK TO RUNNING
  // ============================================================

  const resumeMutation = `
    mutation ResumeWorkflow(
      $workflowRunId: uuid!
    ) {
      update_workflow_runs_by_pk(
        pk_columns: {
          id: $workflowRunId
        }
        _set: {
          status: "running"
        }
      ) {
        id
        status
      }
    }
  `;

  await hasuraRequest(
    resumeMutation,
    {
      workflowRunId:
        workflowRun.id
    }
  );

  // ============================================================
  // 11. RESUME FROM NEXT STEP
  // ============================================================

  const resumedWorkflow =
    await executeWorkflow({
      workflowId:
        workflow.id,

      userId,

      triggerType:
        "approval_resume",

      startAfterPosition:
        stepRun.workflow_step.position,

      existingWorkflowRunId:
        workflowRun.id
    });

  return {
    success: true,

    workflowRunId:
      workflowRun.id,

    approvedStepRunId:
      stepRunId,

    approvedBy: userId,

    status:
      resumedWorkflow.status
  };
}
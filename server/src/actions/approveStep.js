import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

/**
 * ============================================================
 * Hasura Action Handler
 * ============================================================
 *
 * Hasura sends:
 *
 * {
 *   "input": {
 *     "step_run_id": "..."
 *   },
 *   "session_variables": {
 *     "x-hasura-user-id": "..."
 *   }
 * }
 *
 * Express receives this as:
 *
 * approveStepHandler(req, res)
 *
 * The handler extracts the values and then calls the actual
 * approval business logic below.
 */
export async function approveStepHandler(req, res) {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user from Hasura session variables
    // ----------------------------------------------------------

    const userId =
      req.body?.session_variables?.[
        "x-hasura-user-id"
      ];

    // ----------------------------------------------------------
    // 2. Get step_run_id from Hasura Action input
    // ----------------------------------------------------------

    const stepRunId =
      req.body?.input?.step_run_id;

    // ----------------------------------------------------------
    // 3. Validate authentication
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHENTICATED",
        message: "Authentication required"
      });
    }

    // ----------------------------------------------------------
    // 4. Validate input
    // ----------------------------------------------------------

    if (!stepRunId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "step_run_id is required"
      });
    }

    console.log(
      `[ACTION] approveStep: stepRun=${stepRunId}, user=${userId}`
    );

    // ----------------------------------------------------------
    // 5. Call approval business logic
    // ----------------------------------------------------------

    const result = await approveStep({
      stepRunId,
      userId
    });

    // ----------------------------------------------------------
    // 6. Return Hasura Action response
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      workflowRunId: result.workflowRunId,
      status: result.status,
      message: result.message
    });

  } catch (error) {
    console.error(
      "[ACTION] approveStep failed:",
      error
    );

    let statusCode = 500;

    if (error.code === "UNAUTHENTICATED") {
      statusCode = 401;
    }

    if (
      error.code === "ORG_ACCESS_DENIED" ||
      error.code === "APPROVAL_FORBIDDEN" ||
      error.code === "WORKFLOW_TRIGGER_FORBIDDEN" ||
      error.code === "STEP_FORBIDDEN"
    ) {
      statusCode = 403;
    }

    if (
      error.code === "INVALID_APPROVAL_STATE"
    ) {
      statusCode = 409;
    }

    if (
      error.code === "INVALID_INPUT" ||
      error.code === "STEP_RUN_NOT_FOUND"
    ) {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      code:
        error.code ||
        "APPROVAL_FAILED",
      message:
        error.message ||
        "Failed to approve step"
    });
  }
}


/**
 * ============================================================
 * Approval Business Logic
 * ============================================================
 *
 * This function does NOT know anything about Express.
 *
 * It receives:
 *
 * {
 *   stepRunId,
 *   userId
 * }
 *
 * and performs:
 *
 * 1. Load step_run
 * 2. Load workflow_run
 * 3. Load workflow
 * 4. Load organization
 * 5. Check membership
 * 6. Check owner/editor role
 * 7. Verify approval_gate
 * 8. Verify paused state
 * 9. Approve step
 * 10. Resume workflow
 */
export async function approveStep({
  stepRunId,
  userId
}) {
  // ----------------------------------------------------------
  // 1. Load step run + workflow context
  // ----------------------------------------------------------

  const query = `
    query GetApprovalContext(
      $stepRunId: uuid!
    ) {
      step_runs(
        where: {
          id: { _eq: $stepRunId }
        }
        limit: 1
      ) {
        id
        status
        workflow_run_id
        workflow_step_id

        workflow_step {
          id
          type
          position
        }

        workflow_run {
          id
          status
          workflow_id

          workflow {
            id
            organization_id
          }
        }
      }
    }
  `;

  const data = await hasuraRequest(
    query,
    {
      stepRunId
    }
  );

  const stepRun =
    data.step_runs?.[0];

  // ----------------------------------------------------------
  // 2. Step run must exist
  // ----------------------------------------------------------

  if (!stepRun) {
    const error = new Error(
      "Step run not found"
    );

    error.code = "STEP_RUN_NOT_FOUND";

    throw error;
  }

  // ----------------------------------------------------------
  // 3. Verify workflow context
  // ----------------------------------------------------------

  const workflowRun =
    stepRun.workflow_run;

  const workflow =
    workflowRun?.workflow;

  if (!workflowRun || !workflow) {
    const error = new Error(
      "Workflow context not found"
    );

    error.code = "WORKFLOW_NOT_FOUND";

    throw error;
  }

  // ----------------------------------------------------------
  // 4. Verify approval gate
  // ----------------------------------------------------------

  if (
    stepRun.workflow_step?.type !==
    "approval_gate"
  ) {
    const error = new Error(
      "This step is not an approval gate"
    );

    error.code = "INVALID_APPROVAL_STATE";

    throw error;
  }

  // ----------------------------------------------------------
  // 5. Verify step is paused
  // ----------------------------------------------------------

  if (stepRun.status !== "paused") {
    const error = new Error(
      "Approval step is not currently paused"
    );

    error.code = "INVALID_APPROVAL_STATE";

    throw error;
  }

  // ----------------------------------------------------------
  // 6. Verify workflow run is paused
  // ----------------------------------------------------------

  if (workflowRun.status !== "paused") {
    const error = new Error(
      "Workflow run is not currently paused"
    );

    error.code = "INVALID_APPROVAL_STATE";

    throw error;
  }

  // ----------------------------------------------------------
  // 7. Check approver membership + role
  // ----------------------------------------------------------

  const membershipQuery = `
    query GetApproverMembership(
      $organizationId: uuid!
      $userId: uuid!
    ) {
      org_members(
        where: {
          organization_id: {
            _eq: $organizationId
          }
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
  `;

  const membershipData =
    await hasuraRequest(
      membershipQuery,
      {
        organizationId:
          workflow.organization_id,
        userId
      }
    );

  const membership =
    membershipData.org_members?.[0];

  // ----------------------------------------------------------
  // 8. User must belong to organization
  // ----------------------------------------------------------

  if (!membership) {
    const error = new Error(
      "You are not a member of this organization"
    );

    error.code = "ORG_ACCESS_DENIED";

    throw error;
  }

  // ----------------------------------------------------------
  // 9. Only owner/editor can approve
  // ----------------------------------------------------------

  if (
    membership.role !== "owner" &&
    membership.role !== "editor"
  ) {
    const error = new Error(
      "You do not have permission to approve this step"
    );

    error.code = "APPROVAL_FORBIDDEN";

    throw error;
  }

  // ----------------------------------------------------------
  // 10. Approve the step
  // ----------------------------------------------------------

  const updateMutation = `
    mutation ApproveStep(
      $stepRunId: uuid!
      $userId: uuid!
    ) {
      update_step_runs(
        where: {
          id: { _eq: $stepRunId }
          status: { _eq: "paused" }
        }
        _set: {
          status: "completed"
          approved_by: $userId
          approved_at: "now()"
        }
      ) {
        affected_rows

        returning {
          id
          status
          approved_by
          approved_at
        }
      }
    }
  `;

  const updateData =
    await hasuraRequest(
      updateMutation,
      {
        stepRunId,
        userId
      }
    );

  if (
    updateData.update_step_runs
      ?.affected_rows !== 1
  ) {
    const error = new Error(
      "Approval step was already approved or is no longer paused"
    );

    error.code = "INVALID_APPROVAL_STATE";

    throw error;
  }

  // ----------------------------------------------------------
  // 11. Resume workflow
  //
  // IMPORTANT:
  // executeWorkflow.js must later support:
  //
  // existingWorkflowRunId
  // startAfterPosition
  //
  // We identified this as another issue in your project.
  // ----------------------------------------------------------

  const result =
    await executeWorkflow({
      workflowId: workflow.id,
      userId,
      triggerType: "approval_resume",
      existingWorkflowRunId:
        workflowRun.id,
      startAfterPosition:
        stepRun.workflow_step.position
    });

  return {
    workflowRunId:
      workflowRun.id,

    status:
      result.status,

    message:
      "Approval accepted and workflow resumed"
  };
}
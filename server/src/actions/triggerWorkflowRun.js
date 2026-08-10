import { executeWorkflow } from "../engine/executeWorkflow.js";

/**
 * Hasura Action handler:
 * triggerWorkflowRun(workflow_id)
 *
 * Hasura sends:
 *
 * {
 *   "input": {
 *     "workflow_id": "..."
 *   },
 *   "session_variables": {
 *     "x-hasura-user-id": "..."
 *   }
 * }
 */
export async function triggerWorkflowRun(req, res) {
  try {
    // ----------------------------------------------------------
    // 1. Get authenticated user
    // ----------------------------------------------------------

    const userId = req.body?.session_variables?.["x-hasura-user-id"];

    // ----------------------------------------------------------
    // 2. Get workflow ID from Hasura Action input
    // ----------------------------------------------------------

    const workflowId = req.body?.input?.workflow_id;

    // ----------------------------------------------------------
    // 3. Validate authentication
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "UNAUTHENTICATED",
        message: "Authentication required",
      });
    }

    // ----------------------------------------------------------
    // 4. Validate workflow ID
    // ----------------------------------------------------------

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        code: "INVALID_INPUT",
        message: "workflow_id is required",
      });
    }

    console.log(
      `[ACTION] triggerWorkflowRun: workflow=${workflowId}, user=${userId}`,
    );

    // ----------------------------------------------------------
    // 5. Start workflow execution
    //
    // IMPORTANT:
    // The actual workflow engine lives in:
    //
    // engine/executeWorkflow.js
    //
    // This handler only receives the Action request
    // and delegates execution to the engine.
    // ----------------------------------------------------------

    const result = await executeWorkflow({
      workflowId,
      userId,
      triggerType: "manual",
    });

    // ----------------------------------------------------------
    // 6. Return Action response
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      workflowRunId: result.workflowRunId,
      status: result.status,
      message:
        result.message ||
        (result.status === "paused"
          ? "Workflow is waiting for approval."
          : "Workflow executed successfully."),
    });
  } catch (error) {
    console.error("[ACTION] triggerWorkflowRun failed:", error);

    // ----------------------------------------------------------
    // Map known application errors
    // ----------------------------------------------------------

    let statusCode = 500;

    if (error.code === "UNAUTHENTICATED") {
      statusCode = 401;
    }

    if (
      error.code === "ORG_ACCESS_DENIED" ||
      error.code === "WORKFLOW_TRIGGER_FORBIDDEN" ||
      error.code === "STEP_FORBIDDEN"
    ) {
      statusCode = 403;
    }

    if (error.code === "QUOTA_EXCEEDED") {
      statusCode = 429;
    }

    if (error.code === "WORKFLOW_NOT_FOUND" || error.code === "INVALID_INPUT") {
      statusCode = 400;
    }

    return res.status(statusCode).json({
      success: false,
      code: error.code || "WORKFLOW_EXECUTION_FAILED",
      message: error.message || "Failed to execute workflow",
    });
  }
}

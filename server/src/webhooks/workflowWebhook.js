import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

export async function workflowWebhook(req, res) {
  try {
    const workflowId =
      req.params.workflowId;

    if (!workflowId) {
      return res.status(400).json({
        success: false,
        code: "WORKFLOW_ID_REQUIRED",
        message: "Workflow ID is required"
      });
    }

    // ----------------------------------------------------------
    // 1. FIND ENABLED WEBHOOK TRIGGER
    // ----------------------------------------------------------

    const query = `
      query GetWebhookTrigger(
        $workflowId: uuid!
      ) {
        workflow_triggers(
          where: {
            workflow_id: { _eq: $workflowId }
            type: { _eq: "webhook" }
            enabled: { _eq: true }
          }
          limit: 1
        ) {
          id
          workflow_id
          type
          config
          enabled
        }

        workflows_by_pk(
          id: $workflowId
        ) {
          id
          organization_id
        }
      }
    `;

    const data = await hasuraRequest(
      query,
      {
        workflowId
      }
    );

    const workflow =
      data.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        success: false,
        code: "WORKFLOW_NOT_FOUND",
        message: "Workflow not found"
      });
    }

    const trigger =
      data.workflow_triggers?.[0];

    if (!trigger) {
      return res.status(404).json({
        success: false,
        code: "WEBHOOK_NOT_ENABLED",
        message:
          "Webhook trigger is not enabled for this workflow"
      });
    }

    // ----------------------------------------------------------
    // 2. OPTIONAL WEBHOOK SECRET
    // ----------------------------------------------------------

    const configuredSecret =
      trigger.config?.secret;

    const providedSecret =
      req.headers["x-webhook-secret"];

    if (
      configuredSecret &&
      providedSecret !== configuredSecret
    ) {
      return res.status(401).json({
        success: false,
        code: "INVALID_WEBHOOK_SECRET",
        message: "Invalid webhook secret"
      });
    }

    // ----------------------------------------------------------
    // 3. EXECUTE WORKFLOW
    // ----------------------------------------------------------

    /*
      A webhook is an external trigger.

      There may not be a logged-in Nhost user.

      The workflow itself must therefore be configured
      with the organization and webhook trigger.

      The execution engine should distinguish this
      from a normal user-triggered execution.
    */

    const result =
      await executeWorkflow({
        workflowId,

        userId: null,

        triggerType: "webhook"
      });

    return res.status(200).json({
      success: true,

      workflowRunId:
        result.workflowRunId,

      status:
        result.status
    });

  } catch (error) {
    console.error(
      "Webhook workflow failed:",
      error
    );

    return res.status(500).json({
      success: false,
      code:
        error.code ||
        "WEBHOOK_EXECUTION_FAILED",
      message: error.message
    });
  }
}
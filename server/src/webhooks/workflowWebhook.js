import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

export async function workflowWebhook(req, res) {
  try {
    const workflowId = req.params.workflowId;
    if (!workflowId) return res.status(400).json({ success: false, code: "WORKFLOW_ID_REQUIRED", message: "Workflow ID is required" });

    const data = await hasuraRequest(`query GetWebhookTrigger($workflowId: uuid!) {
      workflow_triggers(
        where: {
          workflow_id: { _eq: $workflowId }
          type: { _eq: "webhook" }
          enabled: { _eq: true }
        }
        limit: 1
      ) { id workflow_id config enabled }
    }`, { workflowId });

    const trigger = data.workflow_triggers?.[0];
    if (!trigger) return res.status(404).json({ success: false, code: "WEBHOOK_NOT_ENABLED", message: "Webhook trigger is not enabled for this workflow" });

    const configuredSecret = trigger.config?.secret;
    const providedSecret = req.headers["x-webhook-secret"];
    if (!configuredSecret || providedSecret !== configuredSecret) {
      return res.status(401).json({ success: false, code: "INVALID_WEBHOOK_SECRET", message: "Invalid webhook secret" });
    }

    const result = await executeWorkflow({
      workflowId,
      triggerType: "webhook",
      initialInput: req.body ?? {},
    });

    return res.status(200).json({ success: true, workflowRunId: result.workflowRunId, status: result.status, message: result.message });
  } catch (error) {
    console.error("Webhook workflow failed", error);
    const status = error.code === "QUOTA_EXCEEDED" ? 429 : error.code === "INVALID_WEBHOOK_SECRET" ? 401 : 500;
    return res.status(status).json({ success: false, code: error.code || "WEBHOOK_EXECUTION_FAILED", message: error.message });
  }
}

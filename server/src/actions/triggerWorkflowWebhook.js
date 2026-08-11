import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

export async function triggerWorkflowWebhook(req, res) {
  try {
    const workflowId = req.body?.input?.workflow_id;
    const secret = req.body?.input?.secret;
    const rawPayload = req.body?.input?.payload;
    let input = {};
    if (rawPayload) {
      try { input = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload; }
      catch { return res.status(400).json({ success: false, code: "INVALID_PAYLOAD", message: "payload must be valid JSON" }); }
    }

    if (!workflowId || !secret) {
      return res.status(400).json({ success: false, code: "INVALID_INPUT", message: "workflow_id and secret are required" });
    }

    const data = await hasuraRequest(`query WebhookTrigger($workflowId: uuid!) {
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
    if (!trigger) return res.status(404).json({ success: false, code: "WEBHOOK_NOT_ENABLED", message: "Webhook trigger is not enabled" });
    if (trigger.config?.secret !== secret) return res.status(401).json({ success: false, code: "INVALID_WEBHOOK_SECRET", message: "Invalid webhook secret" });

    const result = await executeWorkflow({
      workflowId,
      triggerType: "webhook",
      initialInput: input,
    });

    return res.status(200).json({
      success: true,
      workflowRunId: result.workflowRunId,
      status: result.status,
      message: result.message || "Workflow triggered by webhook",
    });
  } catch (error) {
    console.error("[ACTION] triggerWorkflowWebhook failed", error);
    return res.status(500).json({ success: false, code: error.code || "WEBHOOK_TRIGGER_FAILED", message: error.message });
  }
}

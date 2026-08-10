import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

/** Hasura Action handler for external webhook starts. */
export async function webhookWorkflow(req, res) {
  try {
    const workflowId = req.body?.input?.workflow_id;
    const secret = req.body?.input?.secret;
    const input = req.body?.input?.payload ?? {};

    if (!workflowId || !secret) {
      return res.status(400).json({ success: false, code: "INVALID_INPUT", message: "workflow_id and secret are required" });
    }

    const data = await hasuraRequest(`
      query WebhookTrigger($workflowId: uuid!) {
        workflows_by_pk(id: $workflowId) { id }
        workflow_triggers(
          where: { workflow_id: { _eq: $workflowId }, type: { _eq: "webhook" }, enabled: { _eq: true } }
          limit: 1
        ) { config }
      }
    `, { workflowId });

    if (!data.workflows_by_pk) {
      return res.status(404).json({ success: false, code: "WORKFLOW_NOT_FOUND", message: "Workflow not found" });
    }

    const configuredSecret = data.workflow_triggers?.[0]?.config?.secret;
    if (!configuredSecret || secret !== configuredSecret) {
      return res.status(401).json({ success: false, code: "INVALID_WEBHOOK_SECRET", message: "Invalid webhook secret" });
    }

    const result = await executeWorkflow({
      workflowId,
      userId: null,
      triggerType: "webhook",
      initialInput: input,
    });

    return res.status(200).json({ success: true, workflowRunId: result.workflowRunId, status: result.status, message: result.message });
  } catch (error) {
    console.error("[ACTION] webhookWorkflow failed:", error);
    return res.status(error.code === "QUOTA_EXCEEDED" ? 429 : 500).json({
      success: false,
      code: error.code || "WEBHOOK_EXECUTION_FAILED",
      message: error.message || "Webhook workflow failed",
    });
  }
}

import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

function verifyEventSecret(req) {
  const expected = process.env.FLOWFORGE_EVENT_SECRET;
  if (!expected) return true;
  return req.headers["x-flowforge-event-secret"] === expected;
}

export async function databaseEvent(req, res) {
  if (!verifyEventSecret(req)) return res.status(401).json({ success: false, message: "Invalid event secret" });
  try {
    const event = req.body?.event || {};
    const operation = event.op || "INSERT";
    const table = req.body?.table?.name || "";
    const row = event.data?.new || event.data?.old || {};

    const data = await hasuraRequest(`query DatabaseEventTriggers {
      workflow_triggers(where: { type: { _eq: "database_event" }, enabled: { _eq: true } }) {
        id workflow_id config enabled
      }
    }`);

    const matching = (data.workflow_triggers || []).filter((trigger) => {
      const config = trigger.config || {};
      const sourceTable = config.source_table || "workflow_results";
      const sourceOperation = String(config.operation || "INSERT").toUpperCase();
      return sourceTable === table && sourceOperation === String(operation).toUpperCase();
    });

    const started = [];
    for (const trigger of matching) {
      // Prevent an event-triggered workflow from recursively triggering itself.
      if (row.workflow_id && row.workflow_id === trigger.workflow_id) continue;

      try {
        const result = await executeWorkflow({
          workflowId: trigger.workflow_id,
          triggerType: "database_event",
          initialInput: row,
        });
        started.push({ workflowId: trigger.workflow_id, workflowRunId: result.workflowRunId, status: result.status });
      } catch (error) {
        started.push({ workflowId: trigger.workflow_id, status: "failed", error: error.message });
      }
    }

    return res.status(200).json({ success: true, matched: matching.length, started });
  } catch (error) {
    console.error("[EVENT] database_event failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

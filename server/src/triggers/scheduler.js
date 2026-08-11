import { hasuraRequest } from "../services/hasura.js";
import { executeWorkflow } from "../engine/executeWorkflow.js";

let running = false;

export function startScheduler() {
  const intervalMs = Math.max(15_000, Number(process.env.SCHEDULER_POLL_MS || 30_000));
  console.log(`[SCHEDULER] Started with ${intervalMs}ms polling`);

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const data = await hasuraRequest(`query ScheduledTriggers {
        workflow_triggers(where: { type: { _eq: "scheduled" }, enabled: { _eq: true } }) {
          id workflow_id config enabled
        }
      }`);

      for (const trigger of data.workflow_triggers || []) {
        const config = trigger.config || {};
        const intervalSeconds = Number(config.interval_seconds || 0);
        if (!intervalSeconds) continue;

        const lastRun = config.last_run_at ? new Date(config.last_run_at).getTime() : 0;
        if (Date.now() - lastRun < intervalSeconds * 1000) continue;

        await hasuraRequest(`mutation MarkScheduledTrigger($id: uuid!, $config: jsonb!) {
          update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config }) { id }
        }`, {
          id: trigger.id,
          config: { ...config, last_run_at: new Date().toISOString() },
        });

        executeWorkflow({ workflowId: trigger.workflow_id, userId: null, triggerType: "scheduled" })
          .then((result) => console.log(`[SCHEDULER] ${trigger.workflow_id} -> ${result.status}`))
          .catch((error) => console.error(`[SCHEDULER] ${trigger.workflow_id} failed`, error));
      }
    } catch (error) {
      console.error("[SCHEDULER] Poll failed", error);
    } finally {
      running = false;
    }
  }, intervalMs);
}

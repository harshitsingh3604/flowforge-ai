import { hasuraRequest } from "../services/hasura.js";

export async function executeNotify({ step, input, context }) {
  const config = step.config || {};
  const channel = config.channel || "email";
  const payload = context?.previousOutput ?? input ?? {};

  const result = await hasuraRequest(`
    mutation CreateNotificationEvent(
      $workflowId: uuid!
      $workflowRunId: uuid!
      $stepRunId: uuid!
      $channel: String!
      $payload: jsonb!
    ) {
      insert_notification_events_one(
        object: {
          workflow_id: $workflowId
          workflow_run_id: $workflowRunId
          step_run_id: $stepRunId
          channel: $channel
          payload: $payload
        }
      ) { id created_at }
    }
  `, {
    workflowId: context.workflowId,
    workflowRunId: context.workflowRunId,
    stepRunId: context.stepRunId,
    channel,
    payload,
  });

  return {
    status: "completed",
    output: { eventCreated: true, notificationEventId: result.insert_notification_events_one.id },
  };
}

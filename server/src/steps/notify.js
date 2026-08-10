import { hasuraRequest } from "../services/hasura.js";

export async function executeNotify({
  step,
  input,
  context
}) {
  const config = step.config || {};

  const message =
    config.message ||
    "Workflow notification";

  const channel =
    config.channel || "email";

  const recipient =
    config.recipient || null;

  const payload =
    context?.previousOutput ?? input ?? {};

  const mutation = `
    mutation CreateNotificationEvent(
      $organizationId: uuid!
      $workflowId: uuid!
      $workflowRunId: uuid!
      $stepRunId: uuid!
      $channel: String!
      $recipient: String
      $message: String!
      $payload: jsonb!
    ) {
      insert_notification_events_one(
        object: {
          organization_id: $organizationId
          workflow_id: $workflowId
          workflow_run_id: $workflowRunId
          step_run_id: $stepRunId
          channel: $channel
          recipient: $recipient
          message: $message
          payload: $payload
        }
      ) {
        id
        created_at
      }
    }
  `;

  const result = await hasuraRequest(
    mutation,
    {
      organizationId:
        context.organizationId,

      workflowId:
        context.workflowId,

      workflowRunId:
        context.workflowRunId,

      stepRunId:
        context.stepRunId,

      channel,

      recipient,

      message,

      payload
    }
  );

  return {
    status: "completed",

    output: {
      eventCreated: true,

      notificationEventId:
        result
          .insert_notification_events_one
          .id
    }
  };
}
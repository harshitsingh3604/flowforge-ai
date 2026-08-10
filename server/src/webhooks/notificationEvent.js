/**
 * Hasura Event Trigger receiver for notification_events.
 * The assignment only requires notify to be wired through an Event Trigger;
 * the event is persisted first, then this handler acknowledges it.
 */
export async function notificationEvent(req, res) {
  console.log("[EVENT] notification_events", JSON.stringify(req.body));
  return res.status(200).json({ success: true });
}

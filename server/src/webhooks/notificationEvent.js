import { hasuraRequest } from "../services/hasura.js";

function verifyEventSecret(req) {
  const expected = process.env.FLOWFORGE_EVENT_SECRET;
  if (!expected) return true;
  return req.headers["x-flowforge-event-secret"] === expected;
}

export async function notificationEvent(req, res) {
  if (!verifyEventSecret(req)) return res.status(401).json({ success: false, message: "Invalid event secret" });
  try {
    const event = req.body?.event || {};
    const notificationId = event.data?.new?.id;

    if (!notificationId) return res.status(400).json({ success: false, message: "Notification event id is required" });

    await hasuraRequest(`mutation MarkNotificationProcessed($id: uuid!, $processedAt: timestamptz!) {
      update_notification_events_by_pk(
        pk_columns: { id: $id }
        _set: { status: "processed", processed_at: $processedAt, error: null }
      ) { id status processed_at }
    }`, { id: notificationId, processedAt: new Date().toISOString() });

    return res.status(200).json({ success: true, notificationId });
  } catch (error) {
    console.error("[EVENT] notification_events failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

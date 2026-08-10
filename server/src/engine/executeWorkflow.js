export async function executeWorkflow({
  workflowId,
  userId,
  triggerType
}) {
  // 1. Authorization
  // 2. Quota
  // 3. Create workflow run
  // 4. Load steps
  // 5. Execute each step
  // 6. Pause if approval gate
  // 7. Complete if everything succeeds
  // 8. Fail if an unrecoverable error occurs
}
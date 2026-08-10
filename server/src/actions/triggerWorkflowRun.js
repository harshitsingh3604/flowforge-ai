export async function triggerWorkflowRun(req, res) {
  const userId =
    req.body?.session_variables?.["x-hasura-user-id"];

  if (!userId) {
    return res.status(401).json({
      message: "Authentication required",
    });
  }

  const { workflow_id } = req.body.input || {};

  if (!workflow_id) {
    return res.status(400).json({
      message: "workflow_id is required",
    });
  }

  return res.json({
    success: true,
    action: "triggerWorkflowRun",
    workflow_id,
    user_id: userId,
    message: "Action received successfully",
  });
}
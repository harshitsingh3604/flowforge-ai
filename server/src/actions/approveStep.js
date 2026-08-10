export async function approveStep(req, res) {
  const { session_variables, input } = req.body;

  const userId = session_variables?.["x-hasura-user-id"];

  if (!userId) {
    return res.status(401).json({
      message: "Authentication required"
    });
  }

  const { step_run_id } = input || {};

  if (!step_run_id) {
    return res.status(400).json({
      message: "step_run_id is required"
    });
  }

  return res.json({
    success: true,
    action: "approveStep",
    step_run_id,
    user_id: userId,
    message: "Approval Action received successfully"
  });
}
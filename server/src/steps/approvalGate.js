export async function executeApprovalGate({
  step
}) {
  return {
    status: "paused",

    output: {
      message:
        step.config?.message ||
        "Approval required before continuing."
    }
  };
}
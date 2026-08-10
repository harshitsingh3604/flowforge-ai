export async function executeConditionalBranch({ step, context }) {
  const config = step.config || {};
  let valueToCheck = context?.previousOutput;

  if (config.source_step_position != null) {
    const sourceStep = context.workflowSteps?.find(
      (candidate) => candidate.position === Number(config.source_step_position)
    );
    if (sourceStep) valueToCheck = context.outputs?.[sourceStep.id];
  }

  const outputText = JSON.stringify(valueToCheck ?? "").toLowerCase();
  const searchValue = String(config.value || "").toLowerCase();

  let result = false;
  if (config.operator === "contains") result = outputText.includes(searchValue);
  else if (config.operator === "equals") result = outputText === searchValue;

  return {
    status: "completed",
    output: {
      result,
      branch: result ? "true" : "false",
      matched: result,
    },
  };
}

export async function executeConditionalBranch({ step, input, context }) {
  const config = step.config || {};

  let valueToCheck = context?.previousOutput;

  if (config.source_step_position) {
    const sourceStep = context?.workflowSteps?.find(
      (item) => item.position === config.source_step_position,
    );

    if (sourceStep) {
      valueToCheck = context?.outputs?.[sourceStep.id];
    }
  }

  const outputText = JSON.stringify(valueToCheck);

  const searchValue = String(config.value || "").toLowerCase();

  let result = false;

  if (config.operator === "contains") {
    result = outputText.toLowerCase().includes(searchValue);
  }

  return {
    status: "completed",

    output: {
      result,
      branch: result ? "true" : "false",
      matched: result,
    },
  };
}

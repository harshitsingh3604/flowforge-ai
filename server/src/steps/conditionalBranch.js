export async function executeConditionalBranch({
  step,
  input,
  context
}) {
  const config = step.config || {};

  const previousOutput = context?.previousOutput;

  // Convert previous step output into searchable text
  const outputText = JSON.stringify(previousOutput);

  const searchValue = String(
    config.value || ""
  ).toLowerCase();

  let result = false;

  if (config.operator === "contains") {
    result = outputText
      .toLowerCase()
      .includes(searchValue);
  }

  return {
    status: "completed",

    output: {
      result,
      branch: result ? "true" : "false",
      matched: result
    }
  };
}
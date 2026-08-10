import { hasuraRequest } from "../services/hasura.js";

export async function executeDbWrite({ input, context }) {
  const llmStep = context.workflowSteps?.find((step) => step.type === "llm_call");
  const dataToSave = (llmStep && context.outputs?.[llmStep.id]) ?? context.previousOutput ?? input ?? {};

  const result = await hasuraRequest(`
    mutation InsertWorkflowResult(
      $workflowId: uuid!
      $workflowRunId: uuid!
      $stepRunId: uuid!
      $data: jsonb!
    ) {
      insert_workflow_results_one(
        object: {
          workflow_id: $workflowId
          workflow_run_id: $workflowRunId
          step_run_id: $stepRunId
          data: $data
        }
      ) { id created_at }
    }
  `, {
    workflowId: context.workflowId,
    workflowRunId: context.workflowRunId,
    stepRunId: context.stepRunId,
    data: dataToSave,
  });

  return {
    status: "completed",
    output: {
      saved: true,
      resultId: result.insert_workflow_results_one.id,
    },
  };
}

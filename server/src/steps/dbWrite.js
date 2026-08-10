import { hasuraRequest } from "../services/hasura.js";

export async function executeDbWrite({
  step,
  input,
  context
}) {
  const dataToSave =
    context?.previousOutput ?? input;

  if (!dataToSave) {
    throw new Error(
      "No data available to write"
    );
  }

  const mutation = `
    mutation InsertWorkflowResult(
      $organizationId: uuid!
      $workflowId: uuid!
      $workflowRunId: uuid!
      $stepRunId: uuid!
      $data: jsonb!
    ) {
      insert_workflow_results_one(
        object: {
          organization_id: $organizationId
          workflow_id: $workflowId
          workflow_run_id: $workflowRunId
          step_run_id: $stepRunId
          data: $data
        }
      ) {
        id
        created_at
      }
    }
  `;

  const result = await hasuraRequest(
    mutation,
    {
      organizationId:
        context.organizationId,

      workflowId:
        context.workflowId,

      workflowRunId:
        context.workflowRunId,

      stepRunId:
        context.stepRunId,

      data: dataToSave
    }
  );

  return {
    status: "completed",

    output: {
      saved: true,
      resultId:
        result.insert_workflow_results_one.id
    }
  };
}
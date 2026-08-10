import { hasuraRequest } from "./hasura.js";

export async function getWorkflowAuthorization(
  workflowId,
  userId
) {
  const query = `
    query GetWorkflowAuthorization(
      $workflowId: uuid!
      $userId: uuid!
    ) {
      workflows(
        where: {
          id: { _eq: $workflowId }
        }
        limit: 1
      ) {
        id
        organization_id

        organization {
          id

          org_members(
            where: {
              user_id: { _eq: $userId }
            }
            limit: 1
          ) {
            user_id
            role
          }
        }
      }
    }
  `;

  const data = await hasuraRequest(query, {
    workflowId,
    userId
  });

  const workflow = data.workflows?.[0];

  // ----------------------------------------------------------
  // Workflow must exist
  // ----------------------------------------------------------

  if (!workflow) {
    const error = new Error(
      "Workflow not found"
    );

    error.code = "WORKFLOW_NOT_FOUND";

    throw error;
  }

  // ----------------------------------------------------------
  // User must belong to the workflow's organization
  // ----------------------------------------------------------

  const member =
    workflow.organization?.org_members?.[0];

  if (!member) {
    const error = new Error(
      "You are not a member of this organization"
    );

    error.code = "ORG_ACCESS_DENIED";

    throw error;
  }

  // ----------------------------------------------------------
  // Return authorization context
  // ----------------------------------------------------------

  return {
    workflow,
    organizationId:
      workflow.organization_id,
    role: member.role
  };
}
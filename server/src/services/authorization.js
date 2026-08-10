import { hasuraRequest } from "./hasura.js";

export async function getWorkflowAuthorization(
  workflowId,
  userId
) {
  const query = `
    query GetWorkflowAuthorization($workflowId: uuid!) {
      workflows(
        where: {
          id: { _eq: $workflowId }
        }
      ) {
        id
        organization_id

        organization {
          id

          members(
            where: {
              user_id: { _eq: $userId }
            }
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

  const workflow = data.workflows[0];

  if (!workflow) {
    throw new Error("Workflow not found");
  }

  const member = workflow.organization.members[0];

  if (!member) {
    throw new Error("You are not a member of this organization");
  }

  return {
    workflow,
    organizationId: workflow.organization_id,
    role: member.role
  };
}
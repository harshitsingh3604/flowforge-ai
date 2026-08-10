import { hasuraRequest } from "./hasura.js";

export async function getWorkflowAuthorization(workflowId, userId) {
  if (!userId) {
    const error = new Error("Authentication required");
    error.code = "UNAUTHENTICATED";
    throw error;
  }

  const workflowData = await hasuraRequest(`
    query GetWorkflow($workflowId: uuid!) {
      workflows_by_pk(id: $workflowId) {
        id
        organization_id
        name
      }
    }
  `, { workflowId });

  const workflow = workflowData.workflows_by_pk;
  if (!workflow) {
    const error = new Error("Workflow not found");
    error.code = "WORKFLOW_NOT_FOUND";
    throw error;
  }

  const memberData = await hasuraRequest(`
    query GetMembership($organizationId: uuid!, $userId: uuid!) {
      org_members(
        where: {
          organization_id: { _eq: $organizationId }
          user_id: { _eq: $userId }
        }
        limit: 1
      ) {
        user_id
        role
      }
    }
  `, { organizationId: workflow.organization_id, userId });

  const member = memberData.org_members?.[0];
  if (!member) {
    const error = new Error("You are not a member of this organization");
    error.code = "ORG_ACCESS_DENIED";
    throw error;
  }

  return {
    workflow,
    organizationId: workflow.organization_id,
    role: member.role,
  };
}

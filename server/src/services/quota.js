import { hasuraRequest } from "./hasura.js";

export async function checkQuota(organizationId) {
  const query = `
    query CheckQuota($organizationId: uuid!) {
      organizations_by_pk(id: $organizationId) {
        quota_limit
        quota_used
        quota_period_start
      }
    }
  `;

  const data = await hasuraRequest(query, {
    organizationId
  });

  const organization = data.organizations_by_pk;

  if (!organization) {
    throw new Error("Organization not found");
  }

  if (organization.quota_used >= organization.quota_limit) {
    throw new Error("Organization quota exhausted");
  }

  return organization;
}
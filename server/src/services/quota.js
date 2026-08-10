import { hasuraRequest } from "./hasura.js";

export async function checkQuota(organizationId) {
  const data = await hasuraRequest(`
    query CheckOrganizationQuota($organizationId: uuid!) {
      organizations_by_pk(id: $organizationId) {
        id
        quota_limit
        quota_used
        quota_period_start
      }
    }
  `, { organizationId });

  const organization = data.organizations_by_pk;
  if (!organization) throw new Error("Organization not found");

  if (organization.quota_used >= organization.quota_limit) {
    const error = new Error("QUOTA_EXCEEDED");
    error.code = "QUOTA_EXCEEDED";
    throw error;
  }

  return organization;
}

export async function incrementQuota(organizationId) {
  const data = await hasuraRequest(`
    mutation IncrementQuota($organizationId: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $organizationId }
        _inc: { quota_used: 1 }
      ) {
        id
        quota_used
      }
    }
  `, { organizationId });

  return data.update_organizations_by_pk;
}

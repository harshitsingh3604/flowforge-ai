import { hasuraRequest } from "./hasura.js";

export async function checkQuota(organizationId) {
  const data = await hasuraRequest(
    `query CheckOrganizationQuota($organizationId: uuid!) {
      organizations_by_pk(id: $organizationId) {
        id quota_limit quota_used quota_period_start
      }
    }`,
    { organizationId },
  );

  const organization = data.organizations_by_pk;
  if (!organization) {
    const error = new Error("Organization not found");
    error.code = "ORG_NOT_FOUND";
    throw error;
  }

  if (Number(organization.quota_used) >= Number(organization.quota_limit)) {
    const error = new Error("Organization quota has been exhausted");
    error.code = "QUOTA_EXCEEDED";
    throw error;
  }

  return organization;
}

export async function incrementQuota(organizationId) {
  const data = await hasuraRequest(
    `mutation IncrementQuota($organizationId: uuid!) {
      update_organizations_by_pk(
        pk_columns: { id: $organizationId }
        _inc: { quota_used: 1 }
      ) {
        id quota_used quota_limit
      }
    }`,
    { organizationId },
  );

  const updated = data.update_organizations_by_pk;
  if (!updated) {
    const error = new Error("Organization not found");
    error.code = "ORG_NOT_FOUND";
    throw error;
  }
  return updated;
}

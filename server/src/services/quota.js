import { hasuraRequest } from "./hasura.js";

export async function consumeQuota(organizationId) {
  const data = await hasuraRequest(
    `mutation ConsumeOrganizationQuota($organizationId: uuid!) {
      update_organizations(
        where: {
          id: { _eq: $organizationId }
          quota_used: { _lt: quota_limit }
        }
        _inc: {
          quota_used: 1
        }
      ) {
        affected_rows
        returning {
          id
          quota_used
          quota_limit
          quota_period_start
        }
      }
    }`,
    { organizationId },
  );

  if (data.update_organizations.affected_rows === 0) {
    const lookup = await hasuraRequest(
      `query CheckOrganizationExists($organizationId: uuid!) {
        organizations_by_pk(id: $organizationId) {
          id
          quota_limit
          quota_used
          quota_period_start
        }
      }`,
      { organizationId },
    );

    if (!lookup.organizations_by_pk) {
      const error = new Error("Organization not found");
      error.code = "ORG_NOT_FOUND";
      throw error;
    }

    const error = new Error("Organization quota has been exhausted");
    error.code = "QUOTA_EXCEEDED";
    throw error;
  }

  return data.update_organizations.returning[0];
}
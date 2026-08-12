import { hasuraRequest } from "./hasura.js";

export async function consumeQuota(organizationId) {
  const lookup = await hasuraRequest(
    `query GetOrganizationQuota($organizationId: uuid!) {
      organizations_by_pk(id: $organizationId) {
        id
        quota_limit
        quota_used
        quota_period_start
      }
    }`,
    { organizationId },
  );

  const organization = lookup.organizations_by_pk;

  if (!organization) {
    const error = new Error("Organization not found");
    error.code = "ORG_NOT_FOUND";
    throw error;
  }

  const quotaLimit = Number(organization.quota_limit);

  if (!Number.isInteger(quotaLimit) || quotaLimit < 0) {
    const error = new Error("Organization quota limit is invalid");
    error.code = "INVALID_QUOTA";
    throw error;
  }

  const data = await hasuraRequest(
    `mutation ConsumeOrganizationQuota(
      $organizationId: uuid!
      $quotaLimit: Int!
    ) {
      update_organizations(
        where: {
          id: { _eq: $organizationId }
          quota_used: { _lt: $quotaLimit }
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
    {
      organizationId,
      quotaLimit,
    },
  );

  if (data.update_organizations.affected_rows === 0) {
    const error = new Error("Organization quota has been exhausted");
    error.code = "QUOTA_EXCEEDED";
    throw error;
  }

  return data.update_organizations.returning[0];
}
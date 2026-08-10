import { hasuraRequest } from "./hasura.js";

export async function checkQuota(
  organizationId
) {
  const query = `
    query CheckOrganizationQuota(
      $organizationId: uuid!
    ) {
      organizations_by_pk(
        id: $organizationId
      ) {
        id
        quota_limit
        quota_used
        quota_period_start
      }
    }
  `;

  const data = await hasuraRequest(
    query,
    {
      organizationId
    }
  );

  const organization =
    data.organizations_by_pk;

  if (!organization) {
    throw new Error(
      "Organization not found"
    );
  }

  if (
    organization.quota_used >=
    organization.quota_limit
  ) {
    const error = new Error(
      "QUOTA_EXCEEDED"
    );

    error.code = "QUOTA_EXCEEDED";

    throw error;
  }

  return organization;
}
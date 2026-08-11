const HASURA_URL = process.env.HASURA_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

function assertConfig() {
  if (!HASURA_URL) throw new Error("HASURA_GRAPHQL_URL is not configured");
  if (!HASURA_ADMIN_SECRET) throw new Error("HASURA_ADMIN_SECRET is not configured");
}

export async function hasuraRequest(query, variables = {}) {
  assertConfig();

  const response = await fetch(HASURA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Hasura returned non-JSON response (${response.status})`);
  }

  if (!response.ok || result.errors?.length) {
    const message = result.errors?.map((item) => item.message).join("; ") || `Hasura request failed (${response.status})`;
    const error = new Error(message);
    error.code = "HASURA_REQUEST_FAILED";
    throw error;
  }

  return result.data;
}

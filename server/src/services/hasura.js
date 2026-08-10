const HASURA_URL = process.env.HASURA_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

if (!HASURA_URL) throw new Error("HASURA_GRAPHQL_URL is not configured");
if (!HASURA_ADMIN_SECRET) throw new Error("HASURA_ADMIN_SECRET is not configured");

export async function hasuraRequest(query, variables = {}) {
  const response = await fetch(HASURA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });

  const result = await response.json();
  if (!response.ok || result.errors) {
    console.error("Hasura error:", result.errors);
    throw new Error(result.errors?.[0]?.message || "Hasura request failed");
  }
  return result.data;
}

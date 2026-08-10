import { createClient } from "@nhost/nhost-js";

export const nhost = createClient({
  subdomain: import.meta.env.VITE_NHOST_SUBDOMAIN,
  region: import.meta.env.VITE_NHOST_REGION,
  graphqlUrl: import.meta.env.VITE_NHOST_GRAPHQL_URL,
});
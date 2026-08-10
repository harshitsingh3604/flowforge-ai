import { nhost } from "../nhost";

export async function graphqlRequest(query, variables = {}) {
  const response = await nhost.graphql.request({ query, variables });
  const errors = response.body?.errors;
  if (errors?.length) throw new Error(errors[0].message);
  return response.body?.data;
}

export function subscribeStepRuns({ workflowRunId, onData, onError }) {
  const session = nhost.getUserSession();
  const graphqlUrl = import.meta.env.VITE_NHOST_GRAPHQL_URL;
  const wsUrl = import.meta.env.VITE_NHOST_GRAPHQL_WS_URL ||
    graphqlUrl?.replace(/^https:/, "wss:").replace(/^http:/, "ws:") || "";

  if (!wsUrl || !session?.accessToken) {
    onError?.(new Error("GraphQL WebSocket URL or session is missing"));
    return () => {};
  }

  const ws = new WebSocket(wsUrl, "graphql-transport-ws");
  const id = crypto.randomUUID();

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "connection_init",
      payload: {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      },
    }));
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "connection_ack") {
      ws.send(JSON.stringify({
        id,
        type: "subscribe",
        payload: {
          query: `
            subscription StepRunProgress($workflowRunId: uuid!) {
              step_runs(
                where: { workflow_run_id: { _eq: $workflowRunId } }
                order_by: { created_at: asc }
              ) {
                id
                workflow_step_id
                status
                input
                output
                error
                attempt_count
                approved_by
                approved_at
                started_at
                completed_at
                workflow_step { id position name type }
              }
            }
          `,
          variables: { workflowRunId },
        },
      }));
    } else if (message.type === "next") {
      onData?.(message.payload?.data?.step_runs || []);
    } else if (message.type === "error") {
      onError?.(new Error(JSON.stringify(message.payload)));
    }
  };

  ws.onerror = () => onError?.(new Error("GraphQL subscription connection failed"));

  return () => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id, type: "complete" }));
      }
      ws.close();
    } catch {
      // no-op
    }
  };
}

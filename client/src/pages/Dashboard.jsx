import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth/AuthProvider";
import { graphqlRequest, subscribeStepRuns } from "../lib/graphql/api";

const WORKFLOWS_QUERY = `
  query MyWorkflows($userId: uuid!) {
    workflows(order_by: { created_at: desc }) {
      id
      name
      description
      organization_id

      workflow_steps(order_by: { position: asc }) {
        id
        position
        name
        type
        config
      }

      workflow_triggers {
        id
        type
        config
        enabled
      }
    }

    org_members(where: { user_id: { _eq: $userId } }) {
      organization_id
      role
    }
  }
`;

function statusClass(status) {
  return `status status-${status || "queued"}`;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();

  const [workflows, setWorkflows] = useState([]);
  const [membership, setMembership] = useState(null);

  const [selectedId, setSelectedId] = useState(null);

  const [run, setRun] = useState(null);
  const [stepRuns, setStepRuns] = useState([]);

  const [usage, setUsage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

  /*
   * ------------------------------------------------------------
   * Load workflows, organization membership and usage
   * ------------------------------------------------------------
   */

  const load = useCallback(async () => {
    if (!user) return;

    setError("");

    try {
      const data = await graphqlRequest(WORKFLOWS_QUERY, {
        userId: user.id,
      });

      const nextWorkflows = data.workflows || [];

      setWorkflows(nextWorkflows);

      const member = data.org_members?.[0] || null;
      setMembership(member);

      setSelectedId((currentSelectedId) => {
        if (
          currentSelectedId &&
          nextWorkflows.some(
            (workflow) => workflow.id === currentSelectedId
          )
        ) {
          return currentSelectedId;
        }

        return nextWorkflows[0]?.id || null;
      });

      /*
       * Usage is displayed only.
       * Actual quota enforcement happens on the server.
       */
      if (member?.organization_id) {
        try {
          const usageData = await graphqlRequest(
            `
              query Usage($orgId: uuid!) {
                organization_usage_this_month(
                  where: {
                    organization_id: {
                      _eq: $orgId
                    }
                  }
                ) {
                  organization_id
                  organization_name
                  quota_limit
                  quota_used
                  completed_runs_this_month
                }
              }
            `,
            {
              orgId: member.organization_id,
            }
          );

          setUsage(
            usageData.organization_usage_this_month?.[0] || null
          );
        } catch {
          setUsage(null);
        }
      } else {
        setUsage(null);
      }
    } catch (e) {
      setError(e.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * ------------------------------------------------------------
   * Selected workflow
   * ------------------------------------------------------------
   */

  const workflow = useMemo(
    () =>
      workflows.find(
        (item) => item.id === selectedId
      ) || null,
    [workflows, selectedId]
  );

  /*
   * ------------------------------------------------------------
   * Load exact workflow run
   * ------------------------------------------------------------
   */

  const refreshRun = useCallback(async (runId) => {
    if (!runId) {
      setRun(null);
      setStepRuns([]);
      return null;
    }

    try {
      const data = await graphqlRequest(
        `
          query Run($id: uuid!) {
            workflow_runs_by_pk(id: $id) {
              id
              workflow_id
              status
              trigger_type
              error
              started_at
              completed_at

              step_runs(
                order_by: {
                  started_at: asc
                }
              ) {
                id
                workflow_run_id
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

                workflow_step {
                  id
                  position
                  name
                  type
                }
              }
            }
          }
        `,
        {
          id: runId,
        }
      );

      const nextRun = data.workflow_runs_by_pk;

      if (!nextRun) {
        setRun(null);
        setStepRuns([]);
        return null;
      }

      /*
       * Only accept step runs belonging to this exact run.
       */
      const scopedStepRuns = (nextRun.step_runs || []).filter(
        (stepRun) =>
          !stepRun.workflow_run_id ||
          stepRun.workflow_run_id === nextRun.id
      );

      setRun(nextRun);
      setStepRuns(scopedStepRuns);

      return {
        ...nextRun,
        step_runs: scopedStepRuns,
      };
    } catch (e) {
      setError(
        e.message || "Failed to load workflow run."
      );

      return null;
    }
  }, []);

  /*
   * ------------------------------------------------------------
   * Load latest run for selected workflow
   * ------------------------------------------------------------
   */

  const refreshLatestRun = useCallback(
    async (workflowId) => {
      if (!workflowId) {
        setRun(null);
        setStepRuns([]);
        return null;
      }

      try {
        const data = await graphqlRequest(
          `
            query LatestWorkflowRun($workflowId: uuid!) {
              workflow_runs(
                where: {
                  workflow_id: {
                    _eq: $workflowId
                  }
                }
                order_by: {
                  started_at: desc
                }
                limit: 1
              ) {
                id
              }
            }
          `,
          {
            workflowId,
          }
        );

        const latestRun = data.workflow_runs?.[0];

        if (!latestRun?.id) {
          setRun(null);
          setStepRuns([]);
          setLive(false);
          return null;
        }

        return await refreshRun(latestRun.id);
      } catch (e) {
        setError(
          e.message || "Failed to load latest workflow run."
        );

        setRun(null);
        setStepRuns([]);

        return null;
      }
    },
    [refreshRun]
  );

  /*
   * ------------------------------------------------------------
   * When workflow selection changes
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!selectedId) {
      setRun(null);
      setStepRuns([]);
      setLive(false);
      return;
    }

    setRun(null);
    setStepRuns([]);
    setLive(false);

    refreshLatestRun(selectedId);
  }, [selectedId, refreshLatestRun]);

  /*
   * ------------------------------------------------------------
   * Live step-run subscription
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!run?.id) {
      setLive(false);
      return undefined;
    }

    setLive(false);

    const unsubscribe = subscribeStepRuns({
      workflowRunId: run.id,

      onData: (rows) => {
        const scopedRows = (rows || []).filter(
          (row) =>
            !row.workflow_run_id ||
            row.workflow_run_id === run.id
        );

        setStepRuns(scopedRows);
        setLive(true);
      },

      onError: () => {
        setLive(false);
      },
    });

    return unsubscribe;
  }, [run?.id]);

  /*
   * ------------------------------------------------------------
   * Latest step run for each workflow step
   * ------------------------------------------------------------
   */

  const latestStepRunsByStepId = useMemo(() => {
    const map = new Map();

    for (const stepRun of stepRuns) {
      if (!stepRun.workflow_step_id) {
        continue;
      }

      const existing = map.get(
        stepRun.workflow_step_id
      );

      if (!existing) {
        map.set(
          stepRun.workflow_step_id,
          stepRun
        );
        continue;
      }

      const existingTime = existing.started_at
        ? new Date(existing.started_at).getTime()
        : 0;

      const currentTime = stepRun.started_at
        ? new Date(stepRun.started_at).getTime()
        : 0;

      if (currentTime >= existingTime) {
        map.set(
          stepRun.workflow_step_id,
          stepRun
        );
      }
    }

    return map;
  }, [stepRuns]);

  /*
   * ------------------------------------------------------------
   * Run workflow
   * ------------------------------------------------------------
   */

  const runWorkflow = async () => {
    if (!workflow) {
      return;
    }

    /*
     * Viewer is read-only.
     */
    if (membership?.role === "viewer") {
      setError(
        "Viewers can read workflows but cannot run them."
      );
      return;
    }

    setBusy(true);
    setError("");

    setRun(null);
    setStepRuns([]);
    setLive(false);

    try {
      const data = await graphqlRequest(
        `
          mutation TriggerWorkflowRun(
            $workflowId: uuid!
          ) {
            triggerWorkflowRun(
              workflow_id: $workflowId
            ) {
              success
              workflowRunId
              status
              message
            }
          }
        `,
        {
          workflowId: workflow.id,
        }
      );

      const result = data.triggerWorkflowRun;

      if (!result?.success) {
        throw new Error(
          result?.message ||
            "Workflow execution failed."
        );
      }

      if (!result?.workflowRunId) {
        throw new Error(
          result?.message ||
            "Workflow did not return a workflow run ID."
        );
      }

      await refreshRun(
        result.workflowRunId
      );
    } catch (e) {
      setError(
        e.message ||
          "Failed to trigger workflow."
      );

      await refreshLatestRun(workflow.id);
    } finally {
      setBusy(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * Approve paused step
   * ------------------------------------------------------------
   */

  const approve = async (stepRunId) => {
    if (!stepRunId) {
      return;
    }

    if (membership?.role === "viewer") {
      setError(
        "Viewers cannot approve workflow steps."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await graphqlRequest(
        `
          mutation ApproveStep(
            $stepRunId: uuid!
          ) {
            approveStep(
              step_run_id: $stepRunId
            ) {
              success
              workflowRunId
              status
              message
            }
          }
        `,
        {
          stepRunId,
        }
      );

      const result = data.approveStep;

      if (!result?.success) {
        throw new Error(
          result?.message ||
            "Approval failed."
        );
      }

      if (!result?.workflowRunId) {
        throw new Error(
          result?.message ||
            "Approval did not return a workflow run ID."
        );
      }

      await refreshRun(
        result.workflowRunId
      );

      await load();
    } catch (e) {
      setError(
        e.message ||
          "Failed to approve step."
      );

      if (run?.id) {
        await refreshRun(run.id);
      }
    } finally {
      setBusy(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * Create demo workflow
   *
   * IMPORTANT:
   * There is intentionally NO duplicate check here.
   * Every click creates a new demo workflow.
   * ------------------------------------------------------------
   */

  const createDemoWorkflow = async () => {
    if (membership?.role !== "owner") {
      setError(
        "Only organization owners can create the demo workflow."
      );
      return;
    }

    setBusy(true);
    setError("");

    try {
      const data = await graphqlRequest(
        `
          mutation CreateWorkflow(
            $orgId: uuid!
          ) {
            insert_workflows_one(
              object: {
                organization_id: $orgId
                name: "Customer Approval Workflow"
                description: "LLM → HTTP → conditional → approval → DB write"
              }
            ) {
              id
            }
          }
        `,
        {
          orgId: membership.organization_id,
        }
      );

      const workflowId =
        data.insert_workflows_one?.id;

      if (!workflowId) {
        throw new Error(
          "Workflow was not created."
        );
      }

      const steps = [
        {
          position: 1,
          name: "Analyze Request",
          type: "llm_call",
          config: {
            model: "gemini-3.6-flash",
            prompt:
              "Analyze this customer request. Start with APPROVE if it should proceed. Request: {{input}}",
          },
        },

        {
          position: 2,
          name: "Fetch External Data",
          type: "http_request",
          config: {
            method: "GET",
            url: "https://jsonplaceholder.typicode.com/todos/1",
          },
        },

        {
          position: 3,
          name: "Check Decision",
          type: "conditional_branch",
          config: {
            source_step_position: 1,
            operator: "contains",
            value: "APPROVE",
            true_next_position: 4,
            false_next_position: 5,
          },
        },

        {
          position: 4,
          name: "Manager Approval",
          type: "approval_gate",
          config: {
            message:
              "Manager approval is required before saving the result.",
          },
        },

        {
          position: 5,
          name: "Save Result",
          type: "db_write",
          config: {},
        },
      ];

      for (const step of steps) {
        await graphqlRequest(
          `
            mutation AddStep(
              $workflowId: uuid!
              $position: Int!
              $name: String!
              $type: String!
              $config: jsonb!
            ) {
              insert_workflow_steps_one(
                object: {
                  workflow_id: $workflowId
                  position: $position
                  name: $name
                  type: $type
                  config: $config
                }
              ) {
                id
              }
            }
          `,
          {
            workflowId,
            ...step,
          }
        );
      }

      await graphqlRequest(
        `
          mutation AddTriggers(
            $workflowId: uuid!
          ) {
            insert_workflow_triggers(
              objects: [
                {
                  workflow_id: $workflowId
                  type: "manual"
                  enabled: true
                }
                {
                  workflow_id: $workflowId
                  type: "webhook"
                  enabled: true
                  config: {
                    secret: "demo-secret"
                  }
                }
              ]
            ) {
              affected_rows
            }
          }
        `,
        {
          workflowId,
        }
      );

      await load();

      setSelectedId(workflowId);

      setRun(null);
      setStepRuns([]);
      setLive(false);
    } catch (e) {
      setError(
        e.message ||
          "Failed to create demo workflow."
      );
    } finally {
      setBusy(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * Loading
   * ------------------------------------------------------------
   */

  if (loading) {
    return (
      <div className="shell">
        <div className="card">
          Loading FlowForge…
        </div>
      </div>
    );
  }

  /*
   * ------------------------------------------------------------
   * Dashboard UI
   * ------------------------------------------------------------
   */

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <strong>FlowForge AI</strong>

          <span className="muted">
            Workflow Control Plane
          </span>
        </div>

        <div className="top-actions">
          <span>
            {user?.email}
          </span>

          {membership?.role && (
            <span className="muted">
              {membership.role}
            </span>
          )}

          <button
            className="ghost"
            onClick={signOut}
            disabled={busy}
          >
            Logout
          </button>
        </div>
      </header>

      {error && (
        <div
          className="alert"
          role="alert"
        >
          {error}
        </div>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">
            MULTI-TENANT AI AUTOMATION
          </p>

          <h1>
            Build, run and approve AI workflows.
          </h1>

          <p className="muted">
            Every workflow is scoped to its
            organization, with live step
            progress and approval gates.
          </p>
        </div>

        <div className="quota">
          <span>Usage</span>

          <strong>
            {usage
              ? `${usage.quota_used} / ${usage.quota_limit}`
              : "—"}
          </strong>

          <small>
            completed this month:{" "}
            {usage?.completed_runs_this_month ?? 0}
          </small>
        </div>
      </section>

      <div className="grid">
        <aside className="card sidebar">
          <div className="section-head">
            <h2>Workflows</h2>

            {membership?.role === "owner" && (
              <button
                onClick={createDemoWorkflow}
                disabled={busy}
              >
                + Demo
              </button>
            )}
          </div>

          {workflows.length === 0 ? (
            <p className="muted">
              No workflows yet. Owner can
              create the demo workflow.
            </p>
          ) : (
            workflows.map((item) => (
              <button
                key={item.id}
                className={`workflow-item ${
                  selectedId === item.id
                    ? "selected"
                    : ""
                }`}
                onClick={() => {
                  setSelectedId(item.id);
                  setRun(null);
                  setStepRuns([]);
                  setLive(false);
                  setError("");
                }}
              >
                <strong>
                  {item.name}
                </strong>

                <span>
                  {item.workflow_steps?.length ||
                    0}{" "}
                  steps
                </span>
              </button>
            ))
          )}
        </aside>

        <main className="card main-card">
          {!workflow ? (
            <div className="empty">
              Select a workflow.
            </div>
          ) : (
            <>
              <div className="section-head">
                <div>
                  <p className="eyebrow">
                    WORKFLOW
                  </p>

                  <h2>
                    {workflow.name}
                  </h2>

                  <p className="muted">
                    {workflow.description}
                  </p>
                </div>

                <button
                  className="primary"
                  onClick={runWorkflow}
                  disabled={
                    busy ||
                    membership?.role ===
                      "viewer"
                  }
                >
                  {busy
                    ? "Running…"
                    : "▶ Run"}
                </button>
              </div>

              <div className="steps">
                {workflow.workflow_steps?.map(
                  (step) => {
                    const sr =
                      latestStepRunsByStepId.get(
                        step.id
                      );

                    const paused =
                      sr?.status === "paused";

                    const canApprove =
                      paused &&
                      membership?.role !==
                        "viewer";

                    return (
                      <div
                        className="step"
                        key={step.id}
                      >
                        <div className="step-number">
                          {step.position}
                        </div>

                        <div className="step-info">
                          <strong>
                            {step.name}
                          </strong>

                          <span>
                            {step.type}
                          </span>
                        </div>

                        <span
                          className={statusClass(
                            sr?.status
                          )}
                        >
                          {sr?.status ||
                            "waiting"}
                        </span>

                        {canApprove && (
                          <button
                            className="approve"
                            onClick={() =>
                              approve(sr.id)
                            }
                            disabled={busy}
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    );
                  }
                )}
              </div>

              {run && (
                <div className="run-panel">
                  <div className="section-head">
                    <h3>
                      Run{" "}
                      {run.id.slice(0, 8)}
                      …
                    </h3>

                    <span
                      className={statusClass(
                        run.status
                      )}
                    >
                      {run.status}
                    </span>
                  </div>

                  <p className="muted">
                    Trigger:{" "}
                    {run.trigger_type} ·{" "}
                    {live
                      ? "Live subscription connected"
                      : "Updating…"}
                  </p>

                  {run.error && (
                    <pre className="error-box">
                      {run.error}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth/AuthProvider";
import { graphqlRequest, subscribeStepRuns } from "../lib/graphql/api";

const STEP_TYPES = [
  ["llm_call", "LLM Call"],
  ["http_request", "HTTP Request"],
  ["conditional_branch", "Conditional Branch"],
  ["approval_gate", "Approval Gate"],
  ["db_write", "DB Write"],
  ["notify", "Notify"],
];

const TRIGGER_TYPES = [
  ["manual", "Manual"],
  ["webhook", "Webhook"],
  ["scheduled", "Scheduled"],
  ["database_event", "Database Event"],
];

const WORKFLOWS_QUERY = `
  query MyWorkflows($orgId: uuid!) {
    workflows(
      where: { organization_id: { _eq: $orgId } }
      order_by: { created_at: desc }
    ) {
      id name description organization_id created_by created_at updated_at
      workflow_steps(order_by: { position: asc }) { id position name type config }
      workflow_triggers { id type config enabled created_at }
    }
    org_members(
      where: { organization_id: { _eq: $orgId } }
      order_by: { created_at: asc }
    ) { id organization_id user_id role created_at }
  }
`;

function statusClass(status) {
  return `status status-${status || "queued"}`;
}

function pretty(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function parseJson(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function defaultStep(type = "llm_call", position = 1) {
  const configs = {
    llm_call: {
      prompt: "Analyze the request and explicitly include APPROVE when it is safe to continue. Request: {{input}}",
      model: "gemini-3.6-flash",
      max_attempts: 2,
    },
    http_request: { method: "GET", url: "https://jsonplaceholder.typicode.com/todos/1" },
    conditional_branch: {
      source_step_position: 1,
      operator: "contains",
      value: "APPROVE",
      true_next_position: position + 1,
      false_next_position: position + 2,
    },
    approval_gate: { message: "Manager approval is required before continuing." },
    db_write: {},
    notify: { channel: "email" },
  };
  return { position, name: `${STEP_TYPES.find(([id]) => id === type)?.[1] || type} ${position}`, type, config: configs[type] || {} };
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [members, setMembers] = useState([]);
  const [org, setOrg] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [run, setRun] = useState(null);
  const [stepRuns, setStepRuns] = useState([]);
  const [usage, setUsage] = useState(null);
  const [tab, setTab] = useState("builder");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [draftStep, setDraftStep] = useState(null);
  const [draftTrigger, setDraftTrigger] = useState(null);
  const [memberDraft, setMemberDraft] = useState({ userId: "", role: "viewer" });

  const membership = useMemo(() => members.find((item) => item.user_id === user?.id) || null, [members, user]);
  const canEdit = membership?.role === "owner" || membership?.role === "editor";
  const canManageMembers = membership?.role === "owner";
  const selectedWorkflow = useMemo(() => workflows.find((item) => item.id === selectedId) || null, [workflows, selectedId]);

  const load = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const memberships = await graphqlRequest(`query MyMemberships($userId: uuid!) {
        org_members(where: { user_id: { _eq: $userId } }, order_by: { created_at: asc }) {
          id organization_id user_id role created_at
          organization { id name quota_limit quota_used quota_period_start }
        }
      }`, { userId: user.id });
      const first = memberships.org_members?.[0];
      if (!first) throw new Error("Your account is not assigned to an organization.");
      setOrg(first.organization);

      const data = await graphqlRequest(WORKFLOWS_QUERY, { orgId: first.organization_id });
      const next = data.workflows || [];
      setWorkflows(next);
      setMembers(data.org_members || []);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id || null);

      try {
        const usageData = await graphqlRequest(`query Usage($orgId: uuid!) {
          organization_usage_this_month(where: { organization_id: { _eq: $orgId } }) {
            organization_id organization_name quota_limit quota_used quota_period_start completed_runs_this_month
          }
        }`, { orgId: first.organization_id });
        setUsage(usageData.organization_usage_this_month?.[0] || first.organization);
      } catch {
        setUsage(first.organization);
      }
    } catch (e) {
      setError(e.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const refreshRun = useCallback(async (runId) => {
    if (!runId) { setRun(null); setStepRuns([]); return null; }
    const data = await graphqlRequest(`query Run($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id workflow_id status trigger_type error started_at completed_at created_at
        step_runs(order_by: { created_at: asc }) {
          id workflow_run_id workflow_step_id status input output error attempt_count approved_by approved_at started_at completed_at
          workflow_step { id position name type }
        }
      }
    }`, { id: runId });
    const next = data.workflow_runs_by_pk;
    if (!next) { setRun(null); setStepRuns([]); return null; }
    setRun(next); setStepRuns(next.step_runs || []); return next;
  }, []);

  const refreshLatestRun = useCallback(async (workflowId) => {
    if (!workflowId) return null;
    const data = await graphqlRequest(`query LatestRun($workflowId: uuid!) {
      workflow_runs(where: { workflow_id: { _eq: $workflowId } }, order_by: { created_at: desc }, limit: 1) { id }
    }`, { workflowId });
    return refreshRun(data.workflow_runs?.[0]?.id);
  }, [refreshRun]);

  useEffect(() => {
    setRun(null); setStepRuns([]); setLive(false);
    if (selectedId) refreshLatestRun(selectedId).catch((e) => setError(e.message));
  }, [selectedId, refreshLatestRun]);

  useEffect(() => {
    if (!run?.id) return undefined;
    const unsubscribe = subscribeStepRuns({
      workflowRunId: run.id,
      onData: (rows) => { setStepRuns(rows || []); setLive(true); },
      onError: () => setLive(false),
    });
    return unsubscribe;
  }, [run?.id]);

  // Subscription is the primary live path. A light polling fallback keeps the
  // UI correct if a browser/proxy drops the WebSocket connection.
  useEffect(() => {
    if (!run?.id || ["completed", "failed", "cancelled"].includes(run.status)) return undefined;
    const timer = window.setInterval(() => {
      refreshRun(run.id).catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [run?.id, run?.status, refreshRun]);

  const latestStepRuns = useMemo(() => {
    const map = new Map();
    for (const item of stepRuns) {
      const old = map.get(item.workflow_step_id);
      if (!old || new Date(item.created_at || item.started_at || 0) >= new Date(old.created_at || old.started_at || 0)) map.set(item.workflow_step_id, item);
    }
    return map;
  }, [stepRuns]);

  async function runWorkflow() {
    if (!selectedWorkflow || !canEdit) return;
    setBusy(true); setError(""); setRun(null); setStepRuns([]);
    try {
      const data = await graphqlRequest(`mutation Trigger($workflowId: uuid!) {
        triggerWorkflowRun(workflow_id: $workflowId) { success workflowRunId status message }
      }`, { workflowId: selectedWorkflow.id });
      if (!data.triggerWorkflowRun?.success) throw new Error(data.triggerWorkflowRun?.message || "Workflow execution failed");
      await refreshRun(data.triggerWorkflowRun.workflowRunId);
      setTab("runs");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function approve(stepRunId) {
    setBusy(true); setError("");
    try {
      const data = await graphqlRequest(`mutation Approve($stepRunId: uuid!) {
        approveStep(step_run_id: $stepRunId) { success workflowRunId status message }
      }`, { stepRunId });
      if (!data.approveStep?.success) throw new Error(data.approveStep?.message || "Approval failed");
      await refreshRun(data.approveStep.workflowRunId);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function createWorkflow() {
    if (!canEdit) return;
    setBusy(true); setError("");
    try {
      const data = await graphqlRequest(`mutation CreateWorkflow($orgId: uuid!, $name: String!, $description: String!) {
        insert_workflows_one(object: { organization_id: $orgId, name: $name, description: $description }) { id }
      }`, { orgId: org.id, name: "Untitled Workflow", description: "Assessment workflow" });
      await load(); setSelectedId(data.insert_workflows_one.id); setTab("builder");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function createDemo() {
    if (!canManageMembers && membership?.role !== "owner") return;
    setBusy(true); setError("");
    try {
      const data = await graphqlRequest(`mutation CreateWorkflow($orgId: uuid!) {
        insert_workflows_one(object: {
          organization_id: $orgId,
          name: "Assessment Approval Workflow",
          description: "LLM → HTTP → conditional → approval → DB write"
        }) { id }
      }`, { orgId: org.id });
      const workflowId = data.insert_workflows_one.id;
      const steps = [
        defaultStep("llm_call", 1),
        defaultStep("http_request", 2),
        { position: 3, name: "Check Decision", type: "conditional_branch", config: { source_step_position: 1, operator: "contains", value: "APPROVE", true_next_position: 4, false_next_position: 5 } },
        defaultStep("approval_gate", 4),
        defaultStep("db_write", 5),
      ];
      for (const step of steps) {
        await graphqlRequest(`mutation AddStep($workflowId: uuid!, $position: Int!, $name: String!, $type: String!, $config: jsonb!) {
          insert_workflow_steps_one(object: { workflow_id: $workflowId, position: $position, name: $name, type: $type, config: $config }) { id }
        }`, { workflowId, ...step });
      }
      await graphqlRequest(`mutation AddTriggers($workflowId: uuid!) {
        insert_workflow_triggers(objects: [
          { workflow_id: $workflowId, type: "manual", enabled: true },
          { workflow_id: $workflowId, type: "webhook", enabled: true, config: { secret: "demo-secret" } },
          { workflow_id: $workflowId, type: "scheduled", enabled: false, config: { interval_seconds: 300 } }
        ]) { affected_rows }
      }`, { workflowId });
      await load(); setSelectedId(workflowId); setTab("builder");
    } catch (e) { setError(e.message || "Failed to create demo workflow."); } finally { setBusy(false); }
  }

  async function saveWorkflowDetails(name, description) {
    if (!selectedWorkflow || !canEdit) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation UpdateWorkflow($id: uuid!, $name: String!, $description: String!) {
        update_workflows_by_pk(pk_columns: { id: $id }, _set: { name: $name, description: $description }) { id }
      }`, { id: selectedWorkflow.id, name, description });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveStep() {
    if (!draftStep || !selectedWorkflow || !canEdit) return;
    setBusy(true); setError("");
    try {
      const config = parseJson(draftStep.configText);
      if (draftStep.id) {
        await graphqlRequest(`mutation UpdateStep($id: uuid!, $position: Int!, $name: String!, $config: jsonb!) {
          update_workflow_steps_by_pk(pk_columns: { id: $id }, _set: { position: $position, name: $name, config: $config }) { id }
        }`, { id: draftStep.id, position: Number(draftStep.position), name: draftStep.name, config });
      } else {
        await graphqlRequest(`mutation AddStep($workflowId: uuid!, $position: Int!, $name: String!, $type: String!, $config: jsonb!) {
          insert_workflow_steps_one(object: { workflow_id: $workflowId, position: $position, name: $name, type: $type, config: $config }) { id }
        }`, { workflowId: selectedWorkflow.id, position: Number(draftStep.position), name: draftStep.name, type: draftStep.type, config });
      }
      setDraftStep(null); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteStep(stepId) {
    if (!canEdit) return;
    if (!window.confirm("Delete this workflow step?")) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation DeleteStep($id: uuid!) { delete_workflow_steps_by_pk(id: $id) { id } }`, { id: stepId });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function saveTrigger() {
    if (!draftTrigger || !selectedWorkflow || !canEdit) return;
    setBusy(true); setError("");
    try {
      const config = parseJson(draftTrigger.configText);
      if (draftTrigger.id) {
        await graphqlRequest(`mutation UpdateTrigger($id: uuid!, $config: jsonb!, $enabled: Boolean!) {
          update_workflow_triggers_by_pk(pk_columns: { id: $id }, _set: { config: $config, enabled: $enabled }) { id }
        }`, { id: draftTrigger.id, config, enabled: draftTrigger.enabled });
      } else {
        await graphqlRequest(`mutation AddTrigger($workflowId: uuid!, $type: String!, $config: jsonb!, $enabled: Boolean!) {
          insert_workflow_triggers_one(object: { workflow_id: $workflowId, type: $type, config: $config, enabled: $enabled }) { id }
        }`, { workflowId: selectedWorkflow.id, type: draftTrigger.type, config, enabled: draftTrigger.enabled });
      }
      setDraftTrigger(null); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function deleteTrigger(id) {
    if (!canEdit) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation DeleteTrigger($id: uuid!) { delete_workflow_triggers_by_pk(id: $id) { id } }`, { id });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function addMember() {
    if (!canManageMembers || !memberDraft.userId) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation AddMember($orgId: uuid!, $userId: uuid!, $role: String!) {
        insert_org_members_one(object: { organization_id: $orgId, user_id: $userId, role: $role }) { id }
      }`, { orgId: org.id, userId: memberDraft.userId.trim(), role: memberDraft.role });
      setMemberDraft({ userId: "", role: "viewer" }); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function updateMember(id, role) {
    if (!canManageMembers) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation UpdateMember($id: uuid!, $role: String!) {
        update_org_members_by_pk(pk_columns: { id: $id }, _set: { role: $role }) { id }
      }`, { id, role });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function removeMember(id) {
    if (!canManageMembers || !window.confirm("Remove this organization member?")) return;
    setBusy(true); setError("");
    try {
      await graphqlRequest(`mutation DeleteMember($id: uuid!) { delete_org_members_by_pk(id: $id) { id } }`, { id });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (loading) return <div className="loading-screen"><div className="card loading-card">Loading FlowForge…</div></div>;

  const latestByStep = latestStepRuns;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">F</div><div><strong>FlowForge AI</strong><span>Workflow control plane</span></div></div>
        <div className="top-actions"><span className="user-pill">{user?.email}</span><span className="role-pill">{membership?.role || "member"}</span><button className="ghost" onClick={signOut}>Sign out</button></div>
      </header>

      {error && <div className="alert"><strong>Action failed</strong><span>{error}</span><button onClick={() => setError("")}>×</button></div>}

      <section className="hero-panel">
        <div><p className="eyebrow">MULTI-TENANT AI AUTOMATION</p><h1>Build workflows that survive real execution.</h1><p className="hero-copy">Design steps, wire triggers, run durable executions, pause for human approval, and watch step state update live through Hasura subscriptions.</p></div>
        <div className="usage-card"><span>Monthly usage</span><strong>{usage?.quota_used ?? "—"} <small>/ {usage?.quota_limit ?? "—"}</small></strong><div className="usage-bar"><i style={{ width: `${Math.min(100, ((usage?.quota_used || 0) / Math.max(1, usage?.quota_limit || 1)) * 100)}%` }} /></div><small>{usage?.completed_runs_this_month ?? 0} completed runs</small></div>
      </section>

      <div className="workspace">
        <aside className="card workflow-sidebar">
          <div className="sidebar-head"><div><span className="eyebrow">ORGANIZATION</span><h2>{org?.name || "Organization"}</h2></div><span className="role-pill">{membership?.role}</span></div>
          <div className="sidebar-actions">{canEdit && <button className="primary small" onClick={createWorkflow} disabled={busy}>+ New</button>}{membership?.role === "owner" && <button className="secondary small" onClick={createDemo} disabled={busy}>+ Demo</button>}</div>
          <div className="workflow-list">{workflows.map((item) => <button key={item.id} className={`workflow-card ${selectedId === item.id ? "active" : ""}`} onClick={() => setSelectedId(item.id)}><strong>{item.name}</strong><span>{item.workflow_steps?.length || 0} steps · {item.workflow_triggers?.length || 0} triggers</span></button>)}{!workflows.length && <div className="empty-small">No workflows yet.</div>}</div>
        </aside>

        <main className="card main-panel">
          {!selectedWorkflow ? <div className="empty-state"><div className="empty-icon">＋</div><h2>Create your first workflow</h2><p>Owners and editors can create a workflow. Owners can also create the assessment demo.</p></div> : <>
            <div className="panel-head">
              <div><p className="eyebrow">WORKFLOW</p><h2>{selectedWorkflow.name}</h2><p className="muted">{selectedWorkflow.description || "No description"}</p></div>
              <div className="panel-actions">{canEdit && <button className="primary" onClick={runWorkflow} disabled={busy}>{busy ? "Working…" : "▶ Run workflow"}</button>}</div>
            </div>
            <nav className="tabs"><button className={tab === "builder" ? "active" : ""} onClick={() => setTab("builder")}>Builder</button><button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>Runs</button>{canManageMembers && <button className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>Members</button>}</nav>

            {tab === "builder" && <BuilderView workflow={selectedWorkflow} canEdit={canEdit} isOwner={membership?.role === "owner"} busy={busy} onSaveDetails={saveWorkflowDetails} onEditStep={(step) => setDraftStep({ ...step, configText: pretty(step.config) })} onAddStep={() => setDraftStep({ ...defaultStep("llm_call", (selectedWorkflow.workflow_steps?.length || 0) + 1), configText: pretty(defaultStep("llm_call", (selectedWorkflow.workflow_steps?.length || 0) + 1).config) })} onDeleteStep={deleteStep} onEditTrigger={(trigger) => setDraftTrigger({ ...trigger, configText: pretty(trigger.config), enabled: trigger.enabled })} onAddTrigger={() => setDraftTrigger({ type: "manual", enabled: true, configText: "{}" })} onDeleteTrigger={deleteTrigger} />}
            {tab === "runs" && <RunsView workflow={selectedWorkflow} run={run} stepRuns={stepRuns} live={live} canApprove={membership?.role === "owner" || membership?.role === "editor"} onApprove={approve} latestByStep={latestByStep} onRefresh={() => refreshLatestRun(selectedWorkflow.id)} />}
            {tab === "members" && <MembersView members={members} currentUserId={user?.id} draft={memberDraft} setDraft={setMemberDraft} onAdd={addMember} onRoleChange={updateMember} onRemove={removeMember} busy={busy} />}
          </>}
        </main>
      </div>

      {draftStep && <StepModal draft={draftStep} setDraft={setDraftStep} onSave={saveStep} onClose={() => setDraftStep(null)} busy={busy} canManageSensitive={membership?.role === "owner"} />}
      {draftTrigger && <TriggerModal draft={draftTrigger} setDraft={setDraftTrigger} onSave={saveTrigger} onClose={() => setDraftTrigger(null)} busy={busy} canManageWebhook={membership?.role === "owner"} />}
    </div>
  );
}

function BuilderView({ workflow, canEdit, isOwner, busy, onSaveDetails, onEditStep, onAddStep, onDeleteStep, onEditTrigger, onAddTrigger, onDeleteTrigger }) {
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description || "");
  useEffect(() => { setName(workflow.name); setDescription(workflow.description || ""); }, [workflow.id, workflow.name, workflow.description]);

  return <div className="builder-grid">
    <section className="builder-column">
      <div className="subcard"><div className="subcard-head"><div><span className="eyebrow">DEFINITION</span><h3>Workflow settings</h3></div>{canEdit && <button className="secondary" disabled={busy} onClick={() => onSaveDetails(name.trim(), description.trim())}>Save</button>}</div><label>Name<input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></label><label>Description<textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} /></label></div>
      <div className="subcard"><div className="subcard-head"><div><span className="eyebrow">EXECUTION GRAPH</span><h3>Ordered steps</h3></div>{canEdit && <button className="primary small" onClick={onAddStep}>+ Add step</button>}</div>
        <div className="step-list">{(workflow.workflow_steps || []).map((step) => <div className="builder-step" key={step.id}><span className="step-index">{step.position}</span><div className="step-copy"><strong>{step.name}</strong><span>{step.type}</span></div><div className="step-flags">{["db_write", "notify"].includes(step.type) && <em className="sensitive">Owner only</em>}</div>{canEdit && (!['db_write','notify'].includes(step.type) || isOwner) && <><button className="icon-btn" onClick={() => onEditStep(step)} title="Edit">✎</button><button className="icon-btn danger" onClick={() => onDeleteStep(step.id)} title="Delete">×</button></>}</div>)}</div>
      </div>
    </section>
    <section className="builder-column">
      <div className="subcard"><div className="subcard-head"><div><span className="eyebrow">TRIGGERS</span><h3>Execution entry points</h3></div>{canEdit && <button className="secondary small" onClick={onAddTrigger}>+ Trigger</button>}</div><div className="trigger-list">{(workflow.workflow_triggers || []).map((trigger) => <div className="trigger-row" key={trigger.id}><div><strong>{trigger.type}</strong><span>{trigger.enabled ? "Enabled" : "Disabled"}</span></div><code>{JSON.stringify(trigger.config || {})}</code>{canEdit && (trigger.type !== "webhook" || isOwner) && <div className="row-actions"><button className="icon-btn" onClick={() => onEditTrigger(trigger)}>✎</button><button className="icon-btn danger" onClick={() => onDeleteTrigger(trigger.id)}>×</button></div>}</div>)}</div></div>
      <div className="subcard architecture"><span className="eyebrow">ASSESSMENT PATH</span><h3>Reference scenario</h3><div className="flow"><span>LLM</span><b>→</b><span>HTTP</span><b>→</b><span>Conditional</span><b>→</b><span className="pause">Approval</span><b>→</b><span>DB write</span></div><p className="muted">The demo workflow is designed to pause durably at approval and resume the same workflow run.</p></div>
    </section>
  </div>;
}

function RunsView({ workflow, run, stepRuns, live, canApprove, onApprove, latestByStep, onRefresh }) {
  return <div className="runs-view"><div className="subcard run-summary"><div><span className="eyebrow">LATEST RUN</span><h3>{run ? `${run.id.slice(0, 8)}…` : "No run yet"}</h3></div>{run && <div className="run-meta"><span className={statusClass(run.status)}>{run.status}</span><span>{run.trigger_type}</span><span>{live ? "● live" : "○ reconnecting"}</span><button className="secondary small" onClick={onRefresh}>Refresh</button></div>}</div>{run?.error && <pre className="error-box">{run.error}</pre>}<div className="execution-timeline">{(workflow.workflow_steps || []).map((step) => { const sr = latestByStep.get(step.id); const paused = sr?.status === "paused"; return <div className="execution-step" key={step.id}><span className="step-index">{step.position}</span><div className="step-copy"><strong>{step.name}</strong><span>{step.type}</span>{sr?.error && <small className="error-text">{sr.error}</small>}</div><div className="attempt">{sr?.attempt_count ? `attempt ${sr.attempt_count}` : ""}</div><span className={statusClass(sr?.status)}>{sr?.status || "waiting"}</span>{paused && canApprove && <button className="primary small" onClick={() => onApprove(sr.id)}>Approve</button>}</div>; })}</div>{run && <details className="run-json"><summary>Raw step-run history ({stepRuns.length})</summary><pre>{pretty(stepRuns)}</pre></details>}</div>;
}

function MembersView({ members, currentUserId, draft, setDraft, onAdd, onRoleChange, onRemove, busy }) {
  return <div className="members-view"><div className="subcard"><div className="subcard-head"><div><span className="eyebrow">ACCESS CONTROL</span><h3>Organization members</h3></div></div><p className="muted">Owner membership controls are enforced by Hasura. Add a Nhost user UUID to grant access.</p><div className="member-add"><input placeholder="Nhost user UUID" value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })} /><select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}><option value="owner">owner</option><option value="editor">editor</option><option value="viewer">viewer</option></select><button className="primary" disabled={busy || !draft.userId} onClick={onAdd}>Add member</button></div></div><div className="subcard"><div className="member-table">{members.map((member) => <div className="member-row" key={member.id}><div><strong>{member.user_id === currentUserId ? "You" : member.user_id}</strong><span>{member.created_at ? new Date(member.created_at).toLocaleString() : ""}</span></div><select value={member.role} disabled={member.user_id === currentUserId || busy} onChange={(e) => onRoleChange(member.id, e.target.value)}><option value="owner">owner</option><option value="editor">editor</option><option value="viewer">viewer</option></select><button className="icon-btn danger" disabled={member.user_id === currentUserId || busy} onClick={() => onRemove(member.id)}>×</button></div>)}</div></div></div>;
}

function StepModal({ draft, setDraft, onSave, onClose, busy, canManageSensitive }) {
  return <Modal title={draft.id ? "Edit step" : "Add step"} onClose={onClose}><div className="form-grid"><label>Step type<select value={draft.type} disabled={Boolean(draft.id)} onChange={(e) => { const next = defaultStep(e.target.value, Number(draft.position) || 1); setDraft({ ...draft, type: e.target.value, name: next.name, configText: pretty(next.config) }); }}>{STEP_TYPES.map(([id, label]) => <option key={id} value={id} disabled={!canManageSensitive && ["db_write", "notify"].includes(id)}>{label}</option>)}</select></label><label>Position<input type="number" min="1" value={draft.position} onChange={(e) => setDraft({ ...draft, position: e.target.value })} /></label><label className="wide">Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label className="wide">Configuration JSON<textarea rows="13" value={draft.configText} onChange={(e) => setDraft({ ...draft, configText: e.target.value })} /></label></div><ModalActions onClose={onClose} onSave={onSave} busy={busy} /></Modal>;
}

function TriggerModal({ draft, setDraft, onSave, onClose, busy, canManageWebhook }) {
  return <Modal title={draft.id ? "Edit trigger" : "Add trigger"} onClose={onClose}><div className="form-grid"><label>Trigger type<select value={draft.type} disabled={Boolean(draft.id)} onChange={(e) => setDraft({ ...draft, type: e.target.value, configText: pretty(e.target.value === "webhook" ? { secret: "demo-secret" } : e.target.value === "scheduled" ? { interval_seconds: 300 } : e.target.value === "database_event" ? { source_table: "workflow_results", operation: "INSERT" } : {}) })}>{TRIGGER_TYPES.map(([id, label]) => <option key={id} value={id} disabled={!canManageWebhook && id === "webhook"}>{label}</option>)}</select></label><label className="checkbox"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> Enabled</label><label className="wide">Configuration JSON<textarea rows="12" value={draft.configText} onChange={(e) => setDraft({ ...draft, configText: e.target.value })} /></label></div><ModalActions onClose={onClose} onSave={onSave} busy={busy} /></Modal>;
}

function Modal({ title, children, onClose }) { return <div className="modal-backdrop"><div className="modal card"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}>×</button></div>{children}</div></div>; }
function ModalActions({ onClose, onSave, busy }) { return <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy} onClick={onSave}>{busy ? "Saving…" : "Save changes"}</button></div>; }

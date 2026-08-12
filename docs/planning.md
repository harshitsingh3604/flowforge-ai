# FlowForge AI — Planning Document

## 1. Project Overview

FlowForge AI is an assessment-focused AI workflow orchestration and workflow-control-plane application.

The application allows authenticated users to work with organization-scoped workflows. A workflow is composed of ordered steps that can perform AI processing, external HTTP requests, conditional branching, human approval, database persistence, and notification-event creation.

The project is intentionally focused on demonstrating the core workflow-control-plane architecture rather than attempting to build a complete commercial automation platform.

The primary engineering focus is:

```text
Authentication
      ↓
Multi-tenancy
      ↓
Authorization
      ↓
Workflow Definition
      ↓
Workflow Execution
      ↓
Human Approval
      ↓
Persistent Results
      ↓
Live Monitoring
```

---

## 2. Problem Statement

Workflow automation systems need to coordinate multiple kinds of work while maintaining authorization, execution state, retries, human intervention, and organization-level isolation.

A simple request/response API is not enough when a workflow can:

- Call an LLM.
- Call an external HTTP service.
- Branch based on previous output.
- Pause for human approval.
- Resume later.
- Persist results.
- Trigger notifications.
- Execute from manual or external events.
- Consume organization-level execution quota.
- Provide live execution progress.

FlowForge AI addresses this by separating:

1. Workflow definition.
2. Workflow execution.
3. Authorization.
4. Persistent execution state.
5. External triggers.
6. Human approval.
7. Live UI updates.

---

## 3. Project Goals

The main goals are:

1. Implement Nhost authentication.
2. Implement organization-scoped multi-tenancy.
3. Implement Owner, Editor, and Viewer roles.
4. Store workflow definitions in PostgreSQL through Nhost/Hasura.
5. Expose workflow data through Hasura GraphQL.
6. Implement the required workflow step types.
7. Build a backend workflow execution engine.
8. Implement durable approval and resume behavior.
9. Implement retry handling.
10. Implement organization quota checks.
11. Support manual workflow execution.
12. Support webhook workflow execution.
13. Support the configured scheduled and database-event trigger architecture.
14. Persist workflow and step execution state.
15. Provide live step-run updates to the React UI.
16. Persist workflow results and notification events.
17. Demonstrate the complete workflow from creation through execution and completion.
18. Keep authorization enforced on the backend rather than relying on frontend controls.

---

## 4. Scope

### In Scope

The assessment implementation focuses on:

- Authentication.
- Organization isolation.
- Role-based authorization.
- Workflow definitions.
- Ordered workflow steps.
- Workflow triggers.
- Workflow execution.
- LLM execution.
- HTTP execution.
- Conditional branching.
- Human approval.
- Database result persistence.
- Notification events.
- Retries.
- Quotas.
- Webhook execution.
- Scheduled trigger architecture.
- Database-event trigger architecture.
- Live GraphQL subscriptions.
- Persistent execution history.

### Out of Scope for the Assessment Version

The following are intentionally future-product work:

- Large visual workflow canvas.
- Advanced workflow versioning.
- Full integration marketplace.
- Enterprise billing.
- Distributed worker infrastructure.
- Complete external notification-provider ecosystem.
- Advanced workflow templates.
- Large-scale production observability platform.

These items are documented separately in:

```text
docs/future-improvements.md
```

---

## 5. User and Organization Model

FlowForge is multi-tenant.

The organization is the primary security boundary:

```text
User
  ↓
Organization Membership
  ↓
Organization
  ↓
Workflow
  ↓
Workflow Run
```

A user can only access workflow data belonging to an organization in which they have membership.

Each membership has one of:

```text
owner
editor
viewer
```

### Owner

The Owner has organization-management capabilities and access to sensitive workflow configuration according to the configured permission model.

Typical responsibilities include:

- Managing organization members.
- Managing roles.
- Creating workflows.
- Editing workflows.
- Running workflows.
- Approving paused workflows.
- Managing sensitive workflow configuration.

### Editor

The Editor can perform normal workflow operations permitted by the application.

Typical capabilities include:

- Reading workflows.
- Editing normal workflow configuration.
- Running workflows where permitted.
- Approving paused workflows.

Owner-only sensitive operations remain protected.

### Viewer

The Viewer is read-oriented.

Viewer capabilities:

```text
Read workflow → allowed
Run workflow  → denied
Approve       → denied
Create/update → denied
```

Frontend role checks are only a UI convenience. Backend and Hasura authorization remain the actual security boundary.

---

## 6. Technical Architecture

The high-level architecture is:

```text
┌──────────────────────┐
│      React UI        │
│   Vite / GraphQL     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Nhost Auth        │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│   Hasura GraphQL     │
│ Queries / Mutations  │
│ Subscriptions/Actions│
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Node.js / Express    │
│ Workflow Control     │
│ Plane + Engine       │
└──────────┬───────────┘
           │
     ┌─────┼───────────────┐
     ▼     ▼               ▼
 PostgreSQL Gemini     External HTTP
     │
     ▼
 Workflow State
```

The execution flow is:

```text
React
  ↓
Nhost Authentication
  ↓
Hasura GraphQL / Action
  ↓
Node.js Backend
  ↓
Authorization
  ↓
Quota Check
  ↓
Workflow Run
  ↓
Step Execution
  ↓
Persist Step State
  ↓
Hasura Subscription
  ↓
React Live Progress
```

---

## 7. Frontend Plan

The frontend is implemented with:

- React.
- Vite.
- Nhost JavaScript SDK.
- Nhost React integration.
- GraphQL.
- React Router dependency.
- Tailwind CSS dependency.
- Custom CSS.

The main frontend responsibilities are:

- Authentication UI.
- Dashboard.
- Current user display.
- Current organization and role display.
- Workflow list.
- Workflow selection.
- Workflow creation/configuration.
- Workflow execution.
- Trigger configuration.
- Approval interaction.
- Live workflow progress.
- Usage display.
- Role-aware UI controls.
- Organization member administration.
- Logout.

The frontend communicates with Hasura through GraphQL and uses subscriptions to observe step-run changes for the selected workflow run.

---

## 8. Backend Plan

The backend is implemented with:

- Node.js.
- Express.
- Hasura GraphQL.
- `graphql-request`.
- Google Gemini.
- HTTP request execution.
- Environment-based configuration.

The backend is responsible for:

- Authentication context handling.
- Organization membership checks.
- Authorization.
- Quota enforcement.
- Workflow run creation.
- Workflow execution.
- Step dispatch.
- Step execution.
- Retry handling.
- Approval processing.
- Workflow resume.
- Database result persistence.
- Notification event creation.
- Webhook execution.
- Trigger validation.
- Error handling.

The backend separates these responsibilities into:

```text
actions/
engine/
services/
steps/
triggers/
webhooks/
```

---

## 9. Hasura Action Plan

The current metadata defines three workflow-related Actions:

```text
approveStep
triggerWorkflowRun
triggerWorkflowWebhook
```

### `triggerWorkflowRun`

Used for authenticated workflow execution from the application.

High-level flow:

```text
Action
  ↓
Authenticate
  ↓
Authorize
  ↓
Check Quota
  ↓
Create Workflow Run
  ↓
Execute Workflow
```

### `approveStep`

Used to approve a paused approval-gate step.

Validation includes:

- Authenticated user.
- Existing step run.
- Existing workflow run.
- Correct approval-gate step.
- Paused step state.
- Paused workflow state.
- Organization membership.
- Owner or Editor permission.

After approval:

```text
step_run → completed
workflow_run → running
```

The workflow resumes from the next step.

### `triggerWorkflowWebhook`

Provides the Action-based webhook workflow trigger path and validates the configured workflow/webhook context before starting execution.

---

## 10. Database Plan

PostgreSQL is managed through Nhost/Hasura.

The primary tables are:

```text
organizations
org_members
workflows
workflow_steps
workflow_triggers
workflow_runs
step_runs
workflow_results
notification_events
```

The schema also contains indexes and a monthly usage view:

```text
organization_usage_this_month
```

### Organizations

```text
organizations
├── id
├── name
├── quota_limit
├── quota_used
├── quota_period_start
├── created_at
└── updated_at
```

### Organization Members

```text
org_members
├── id
├── organization_id
├── user_id
├── role
└── created_at
```

Membership is unique per organization/user pair.

### Workflows

```text
workflows
├── id
├── organization_id
├── name
├── description
├── created_by
├── created_at
└── updated_at
```

### Workflow Steps

```text
workflow_steps
├── id
├── workflow_id
├── position
├── name
├── type
├── config JSONB
├── created_at
└── updated_at
```

The database enforces:

```text
UNIQUE(workflow_id, position)
```

### Workflow Triggers

```text
workflow_triggers
├── id
├── workflow_id
├── type
├── config JSONB
├── enabled
└── created_at
```

Supported trigger types:

```text
manual
webhook
scheduled
database_event
```

### Workflow Runs

```text
workflow_runs
├── id
├── workflow_id
├── trigger_type
├── status
├── created_by
├── started_at
├── completed_at
├── error
└── created_at
```

`created_at` represents creation of the workflow-run record.

`started_at` represents execution start time.

### Step Runs

```text
step_runs
├── id
├── workflow_run_id
├── workflow_step_id
├── status
├── input
├── output
├── error
├── attempt_count
├── approved_by
├── approved_at
├── started_at
└── completed_at
```

### Workflow Results

`workflow_results` stores results generated by the `db_write` step and references:

```text
workflow_id
workflow_run_id
step_run_id
```

The result payload is stored as JSONB.

### Notification Events

`notification_events` stores notification events created by the `notify` step.

It includes fields for:

```text
workflow_id
workflow_run_id
step_run_id
channel
payload
status
```

---

## 11. Workflow Step Design

The execution engine supports six step types:

```text
llm_call
http_request
db_write
notify
conditional_branch
approval_gate
```

Every step has JSONB configuration:

```text
workflow_steps.config
```

This allows each executor to receive step-specific configuration without creating a separate database table for every step type.

---

## 12. LLM Step Plan

The `llm_call` executor uses Google Gemini.

Execution process:

```text
Read API key
     ↓
Read model configuration
     ↓
Read prompt
     ↓
Call Gemini
     ↓
Validate response
     ↓
Persist output
     ↓
Persist attempt count
```

The demo workflow uses an instruction that asks Gemini to produce an output beginning with:

```text
APPROVE
```

when the request should proceed.

That output is later evaluated by the conditional branch.

---

## 13. HTTP Request Step Plan

The `http_request` executor performs a real HTTP request.

Configuration includes:

```text
method
url
headers
body
```

Execution:

```text
Read Configuration
      ↓
Build Request
      ↓
Execute HTTP Request
      ↓
Validate Response
      ↓
Persist Status + Data
```

Non-success HTTP responses are treated as failures and use retry handling.

The demo workflow uses:

```text
https://jsonplaceholder.typicode.com/todos/1
```

as its public HTTP endpoint.

---

## 14. Conditional Branch Plan

The conditional branch evaluates output from a previous step.

The demonstration condition uses:

```text
source_step_position = 1
operator = contains
value = APPROVE
```

Execution:

```text
LLM Output
    ↓
Contains "APPROVE"?
    ├── TRUE  → continue to approval
    └── FALSE → alternate branch
```

This demonstrates that workflow behavior can depend on AI-generated output.

---

## 15. Approval Gate Plan

The approval gate is a durable human-in-the-loop step.

When execution reaches the approval gate:

```text
step_run.status = paused
workflow_run.status = paused
```

The engine does not keep the original request open while waiting for a human.

Instead:

```text
Workflow
   ↓
Paused State Persisted
   ↓
User Approves
   ↓
Workflow Resumes
```

This makes the approval state durable and observable.

---

## 16. Approval Action Plan

`approveStep` validates:

1. The request contains an authenticated user.
2. The step run exists.
3. The workflow run exists.
4. The step is an `approval_gate`.
5. The step run is currently paused.
6. The workflow run is currently paused.
7. The user belongs to the workflow organization.
8. The user is an Owner or Editor.

After successful approval:

```text
approved_by = current user
approved_at = current timestamp
step status = completed
workflow status = running
```

The engine resumes from the next step.

---

## 17. Database Write Plan

The `db_write` executor persists workflow output into:

```text
workflow_results
```

Each result references:

```text
workflow_id
workflow_run_id
step_run_id
```

The actual result is stored as JSONB.

The operation is treated as a sensitive workflow operation according to the configured permission model.

---

## 18. Notification Plan

The `notify` executor creates an entry in:

```text
notification_events
```

Supported database-level channels include:

```text
slack
email
```

The current implementation provides a notification-event integration point rather than implementing a complete external notification provider ecosystem.

Hasura Event Triggers can be used to integrate downstream notification handling.

---

## 19. Retry Plan

Retry behavior is implemented as a reusable service:

```text
server/src/services/retry.js
```

The LLM and HTTP executors use this service.

Conceptually:

```text
Attempt 1
   ↓
Failure
   ↓
Attempt 2
   ↓
Success / Failure
```

The current attempt count is persisted in:

```text
step_runs.attempt_count
```

If retries are exhausted, the step and workflow are marked failed.

---

## 20. Quota Plan

Every organization has:

```text
quota_limit
quota_used
```

Before starting a new workflow run:

```text
quota_used < quota_limit
```

must be true.

If:

```text
quota_used >= quota_limit
```

the backend returns:

```text
QUOTA_EXCEEDED
```

and the workflow execution does not start.

After successful workflow completion, usage is incremented.

The project also provides:

```text
organization_usage_this_month
```

for monthly usage display.

---

## 21. Workflow Trigger Plan

The workflow trigger model supports:

```text
manual
webhook
scheduled
database_event
```

### Manual Trigger

The dashboard provides a Run action:

```text
React Dashboard
      ↓
triggerWorkflowRun
      ↓
Authenticate
      ↓
Authorize
      ↓
Quota
      ↓
Create workflow_run
      ↓
Execute
```

### Webhook Trigger

The backend supports:

```text
POST /webhooks/workflow/:workflowId
```

The webhook flow:

```text
Incoming Request
      ↓
Find Enabled Webhook Trigger
      ↓
Validate Secret
      ↓
Resolve Workflow Organization
      ↓
Create Workflow Run
      ↓
Execute
```

### Scheduled Trigger

The schema and backend include scheduled-trigger support.

Future scheduling capabilities can be expanded independently without changing the workflow execution model.

### Database Event Trigger

The schema and backend include database-event trigger architecture.

Hasura Event Triggers can deliver database events to FlowForge so a workflow can be started from an external database event.

---

## 22. Workflow Execution Design

Execution is separated into:

```text
actions/
engine/
services/
steps/
triggers/
webhooks/
```

The normal execution flow is:

```text
Trigger
   ↓
Authentication
   ↓
Organization Authorization
   ↓
Quota Check
   ↓
Create workflow_run
   ↓
Load Workflow Steps
   ↓
Create step_run
   ↓
Execute Step
   ↓
Persist Result
   ↓
Continue
```

Approval changes the flow:

```text
Step Execution
      ↓
Approval Gate
      ↓
Persist PAUSED
      ↓
Stop Execution
      ↓
approveStep
      ↓
Resume
      ↓
Next Step
```

---

## 23. Workflow Run State Model

Workflow runs use states including:

```text
queued
running
paused
completed
failed
cancelled
```

Normal execution:

```text
queued
   ↓
running
   ↓
completed
```

Approval execution:

```text
queued
   ↓
running
   ↓
paused
   ↓
approval
   ↓
running
   ↓
completed
```

Unrecoverable execution failure:

```text
running
   ↓
failed
```

---

## 24. Step Run Design

Each workflow step produces a `step_run`.

A step run records:

```text
Input
Output
Status
Error
Attempt Count
Start Time
Completion Time
Approval Information
```

This gives the application durable execution history and allows the frontend to display live step state.

---

## 25. GraphQL Subscription Plan

The frontend subscribes to `step_runs` for the current:

```text
workflow_run_id
```

The intended flow is:

```text
Backend updates step_run
        ↓
Hasura GraphQL Subscription
        ↓
React Dashboard
        ↓
Live Step Status
```

The subscription is scoped to the selected workflow run so that the UI observes the correct execution.

---

## 26. Hasura Relationship Plan

The data model is organized as:

```text
organizations
    │
    ├── org_members
    │
    └── workflows
           │
           ├── workflow_steps
           ├── workflow_triggers
           └── workflow_runs
                    │
                    └── step_runs
```

Important relationships:

```text
organization.members
organization.workflows

workflow.organization
workflow.steps
workflow.triggers
workflow.runs

workflow_run.workflow
workflow_run.step_runs

step_run.workflow_run
step_run.workflow_step
```

These relationships support both GraphQL querying and permission rules.

---

## 27. Authorization Plan

Authorization has two primary layers.

### Organization Boundary

A user must belong to the organization associated with the requested workflow.

```text
current_user
     ↓
org_members
     ↓
organization_id
     ↓
workflow.organization_id
```

### Role Boundary

The application distinguishes:

```text
owner
editor
viewer
```

Sensitive operations are protected through backend authorization and Hasura permissions.

The frontend role checks are not considered the primary security boundary.

---

## 28. Frontend Dashboard Plan

The dashboard provides:

- Current user information.
- Current organization role.
- Workflow list.
- Workflow selection.
- Workflow creation/configuration.
- Workflow execution.
- Trigger management.
- Step status display.
- Approval action.
- Workflow run status.
- Live subscription status.
- Organization usage.
- Organization member management.
- Logout.

Role-aware behavior:

```text
Owner
  ↓
Full organization/workflow management

Editor
  ↓
Normal workflow editing/execution/approval according to permissions

Viewer
  ↓
Read-only access
```

---

## 29. Demonstration Workflow Plan

The main demonstration workflow is designed to exercise the important execution concepts:

```text
┌────────────────────────┐
│ 1. Analyze Request     │
│    llm_call             │
└────────────┬───────────┘
             ↓
┌────────────────────────┐
│ 2. Fetch External Data │
│    http_request         │
└────────────┬───────────┘
             ↓
┌────────────────────────┐
│ 3. Check Decision      │
│    conditional_branch  │
└────────────┬───────────┘
             ↓
┌────────────────────────┐
│ 4. Manager Approval    │
│    approval_gate       │
└────────────┬───────────┘
             ↓
           PAUSED
             ↓
       approveStep
             ↓
┌────────────────────────┐
│ 5. Save Result         │
│    db_write            │
└────────────┬───────────┘
             ↓
         COMPLETED
```

This single workflow demonstrates:

- AI execution.
- External API execution.
- Conditional branching.
- Human approval.
- Durable pause/resume.
- Database persistence.
- Live execution visibility.

---

## 30. Project Structure Plan

The planned repository structure is:

```text
flowforge-ai/
│
├── client/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── auth/
│   │   │   │   └── AuthProvider.jsx
│   │   │   ├── graphql/
│   │   │   │   └── api.js
│   │   │   └── nhost.js
│   │   ├── pages/
│   │   │   └── Dashboard.jsx
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── actions/
│   │   │   ├── approveStep.js
│   │   │   ├── triggerWorkflowRun.js
│   │   │   └── triggerWorkflowWebhook.js
│   │   ├── engine/
│   │   │   ├── executeStep.js
│   │   │   └── executeWorkflow.js
│   │   ├── services/
│   │   │   ├── authorization.js
│   │   │   ├── hasura.js
│   │   │   ├── quota.js
│   │   │   └── retry.js
│   │   ├── steps/
│   │   │   ├── approvalGate.js
│   │   │   ├── conditionalBranch.js
│   │   │   ├── dbWrite.js
│   │   │   ├── httpRequest.js
│   │   │   ├── llmCall.js
│   │   │   └── notify.js
│   │   ├── triggers/
│   │   │   └── scheduler.js
│   │   ├── webhooks/
│   │   │   ├── databaseEvent.js
│   │   │   ├── notificationEvent.js
│   │   │   └── workflowWebhook.js
│   │   └── server.js
│   └── package.json
│
├── hasura/
│   ├── metadata/
│   │   └── metadata.json
│   └── migrations/
│       └── default/
│           └── 001_initial_schema/
│               ├── up.sql
│               └── down.sql
│
├── docs/
│   ├── planning.md
│   └── future-improvements.md
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 31. Implementation Order

The project is organized into logical implementation phases.

### Phase 1 — Foundation

- Create repository structure.
- Initialize React/Vite frontend.
- Initialize Node/Express backend.
- Configure Nhost.
- Configure Hasura.
- Configure PostgreSQL migration.
- Configure environment variables.

### Phase 2 — Data Model

Create:

```text
organizations
org_members
workflows
workflow_steps
workflow_triggers
workflow_runs
step_runs
workflow_results
notification_events
```

Then add:

- Relationships.
- Indexes.
- Constraints.
- Monthly usage view.

### Phase 3 — Hasura

- Track tables.
- Configure relationships.
- Configure organization-scoped permissions.
- Configure Owner/Editor/Viewer permissions.
- Configure Actions.
- Configure Event Triggers.
- Verify GraphQL access.

### Phase 4 — Authentication

- Connect React to Nhost.
- Implement `AuthProvider`.
- Implement sign in.
- Implement sign out.
- Display authenticated user.
- Protect the dashboard.

### Phase 5 — Authorization

- Implement organization membership lookup.
- Implement role resolution.
- Implement backend authorization.
- Protect sensitive operations.
- Verify cross-organization isolation.

### Phase 6 — Workflow Engine

- Implement authorization service.
- Implement quota service.
- Implement retry service.
- Implement workflow execution.
- Implement step dispatch.
- Implement persistent workflow state.

### Phase 7 — Step Executors

Implement:

```text
llm_call
http_request
conditional_branch
approval_gate
db_write
notify
```

### Phase 8 — Human Approval

- Persist paused step.
- Persist paused workflow.
- Implement `approveStep`.
- Validate Owner/Editor permission.
- Record approver.
- Resume execution.
- Prevent invalid repeated approvals.

### Phase 9 — Triggers

Implement and verify:

```text
manual
webhook
scheduled
database_event
```

including:

- Trigger configuration.
- Enabled/disabled state.
- Webhook validation.
- Event validation.
- Workflow-run creation.

### Phase 10 — Live UI

- Query workflow runs.
- Query step runs.
- Subscribe to step runs.
- Display live execution status.
- Display paused state.
- Display approval controls.
- Display errors and completion.

### Phase 11 — Integration Testing

Test:

```text
Owner
Editor
Viewer
Organization A
Organization B
```

and verify:

```text
LLM
HTTP
Conditional
Approval
Resume
DB Write
Notification Event
Quota
Webhook
Live Subscription
```

---

## 32. Development Workflow

Development should remain incremental rather than using one large implementation pass.

Recommended sequence:

```text
Foundation
   ↓
Database
   ↓
Authentication
   ↓
Authorization
   ↓
Workflow CRUD
   ↓
Execution Engine
   ↓
Step Executors
   ↓
Approval
   ↓
Triggers
   ↓
Live UI
   ↓
Testing
   ↓
Deployment
```

Each major milestone should be independently testable before moving to the next one.

---

## 33. Testing Strategy

Testing should cover three major levels.

### Unit-Level

Test:

- Authorization decisions.
- Quota checks.
- Retry behavior.
- Conditional evaluation.
- Step dispatch.
- Approval validation.
- Trigger validation.

### Integration-Level

Test:

```text
Trigger
  ↓
Workflow
  ↓
Step Execution
  ↓
Pause
  ↓
Approve
  ↓
Resume
  ↓
Complete
```

### End-to-End

Test:

```text
Login
  ↓
Dashboard
  ↓
Create Workflow
  ↓
Run
  ↓
Observe Live Progress
  ↓
Approve
  ↓
Completed
```

---

## 34. Security Validation Plan

Verify:

### Authentication

```text
Valid credentials → Dashboard
Invalid credentials → Useful error
Logout → Login screen
```

### Organization Isolation

```text
Organization A → A data
Organization B → B data
Cross-organization access → denied
```

### Role Enforcement

```text
Owner   → permitted owner operations
Editor  → permitted editor operations
Viewer  → read-only access
```

### Webhooks

Verify:

```text
Valid secret → accepted
Invalid secret → rejected
Disabled trigger → rejected
```

### Secrets

Verify:

- No API keys are committed.
- No privileged tokens are exposed to the frontend.
- Environment variables contain sensitive configuration.
- Production secrets are configured outside source control.

---

## 35. Error Handling Plan

Important errors to validate include:

```text
AUTH_REQUIRED
FORBIDDEN
WORKFLOW_NOT_FOUND
STEP_NOT_FOUND
QUOTA_EXCEEDED
INVALID_STEP_CONFIG
STEP_EXECUTION_FAILED
APPROVAL_REQUIRED
INVALID_APPROVAL_STATE
APPROVAL_FORBIDDEN
WEBHOOK_NOT_ENABLED
INVALID_WEBHOOK_SECRET
```

Errors should:

1. Be persisted where relevant.
2. Return meaningful messages.
3. Avoid leaking secrets.
4. Be understandable by the frontend.
5. Preserve workflow/step state consistently.

---

## 36. Deployment Plan

The production deployment should contain:

```text
React Frontend
      ↓
Production Hosting
      ↓
Hasura / Nhost
      ↓
Node.js Backend
      ↓
PostgreSQL
```

Before deployment:

- Configure frontend environment variables.
- Configure backend environment variables.
- Configure Gemini credentials.
- Configure Hasura Action URLs.
- Configure Event Trigger URLs.
- Apply database migrations.
- Apply Hasura metadata.
- Verify CORS.
- Verify authentication.
- Verify backend health.
- Verify production GraphQL access.

---

## 37. Final Validation Checklist

### Authentication

- [ ] Valid credentials reach the dashboard.
- [ ] Invalid credentials produce a useful error.
- [ ] Logout returns the user to the authentication state.

### Multi-tenancy

- [ ] Organization A can access Organization A data.
- [ ] Organization B can access Organization B data.
- [ ] Cross-organization access is denied.

### Roles

- [ ] Owner permissions work.
- [ ] Editor permissions work.
- [ ] Viewer permissions work.
- [ ] Viewer cannot run workflows.
- [ ] Viewer cannot approve.
- [ ] Sensitive owner-only operations are protected.

### Workflow

- [ ] Workflow creation works.
- [ ] Workflow steps persist.
- [ ] Workflow triggers persist.
- [ ] Manual execution works.
- [ ] Webhook execution works.
- [ ] Scheduled trigger configuration works.
- [ ] Database-event trigger configuration works.

### Step Execution

- [ ] LLM execution works.
- [ ] HTTP execution works.
- [ ] Conditional branching works.
- [ ] Approval gate persists `paused`.
- [ ] Approval resumes the same workflow run.
- [ ] DB write persists results.
- [ ] Notification events are created.
- [ ] Retry count is persisted.

### Quota

- [ ] Quota is checked before execution.
- [ ] `QUOTA_EXCEEDED` prevents execution.
- [ ] Successful completion updates usage.
- [ ] Monthly usage information is displayed.

### Live Execution

- [ ] Step-run subscription connects.
- [ ] Step status updates appear without refresh.
- [ ] Paused execution is visible.
- [ ] Completed execution is visible.
- [ ] Failed execution is visible.

### Deployment

- [ ] Frontend production build succeeds.
- [ ] Backend starts successfully.
- [ ] Backend health endpoint responds.
- [ ] Hasura Action URLs are reachable.
- [ ] Event Trigger URLs are reachable.
- [ ] No privileged secrets are committed.
- [ ] Production configuration is complete.

---

## 38. Submission Readiness

The application is considered ready for submission when:

- Authentication works.
- Organization isolation works.
- Role permissions work.
- Workflow creation works.
- Manual execution works.
- Webhook execution works.
- Required step types are implemented.
- Approval pauses execution.
- Approval resumes execution.
- DB write persists results.
- Notification events are created.
- Retry attempts are persisted.
- Quota prevents execution when exhausted.
- Live step-run updates work.
- No privileged secrets are committed.
- Frontend production build succeeds.
- Backend starts successfully.
- Hasura Action URLs are configured.
- Event Trigger URLs are configured.
- README is complete.
- `docs/planning.md` is complete.
- `docs/future-improvements.md` is complete.

---

## 39. Long-Term Direction

The assessment version establishes a focused foundation:

```text
Authentication
      ↓
Multi-tenancy
      ↓
Authorization
      ↓
Workflow Definition
      ↓
Workflow Execution
      ↓
Human Approval
      ↓
Persistent Results
      ↓
Live Monitoring
```

A future production-oriented platform can evolve toward:

```text
Visual Builder
      ↓
Versioned Workflows
      ↓
Draft / Publish Lifecycle
      ↓
Durable Job Queue
      ↓
Distributed Workers
      ↓
Multiple AI Providers
      ↓
Secure Credentials
      ↓
Enterprise Integrations
      ↓
Audit + Observability
      ↓
Billing + Organizations
```

The current assessment implementation should remain focused, understandable, testable, and stable while these capabilities are considered as separate product iterations.

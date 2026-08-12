# FlowForge AI

FlowForge AI is an assessment-focused, multi-tenant AI workflow orchestration platform built with **React, Vite, Nhost, Hasura, PostgreSQL, Node.js, Express, and Google Gemini**.

It demonstrates a workflow control plane in which authenticated organization members can create, configure, execute, monitor, and approve workflows according to their role.

The project focuses on durable execution and authorization rather than building a large visual workflow editor.

## Live Application

https://flowforge-ai-murex.vercel.app/

## GitHub

https://github.com/harshitsingh3604/flowforge-ai

---

## 1. What FlowForge AI Does

A workflow is a sequence of executable steps.

Example:

```text
LLM Call
   ↓
HTTP Request
   ↓
Conditional Branch
   ↓
Approval Gate
   ↓
DB Write
```

The workflow engine persists execution state in PostgreSQL through Hasura.

When an approval gate is reached, execution is **paused durably**:

```text
workflow_run.status = paused
step_run.status     = paused
```

The original HTTP request is not kept open.

An authorized organization member can approve the paused step. The approval is persisted and the same workflow run is resumed from the next step.

```text
Approval Gate
      ↓
Persist PAUSED state
      ↓
approveStep
      ↓
approval recorded
      ↓
resume existing workflow run
      ↓
remaining steps
      ↓
COMPLETED
```

---

## 2. Core Features

- Nhost authentication
- Organization-scoped multi-tenancy
- Owner / Editor / Viewer roles
- Hasura GraphQL authorization
- Backend authorization checks
- Workflow CRUD
- Ordered workflow steps
- LLM execution with Google Gemini
- HTTP request steps
- Conditional branching
- Human approval gates
- Durable pause/resume
- Database result persistence
- Notification events
- Retry handling
- Organization quota enforcement
- Manual workflow execution
- Webhook workflow execution
- Scheduled workflow execution
- Database-event workflow execution
- GraphQL subscriptions for live step-run progress
- Cross-organization data isolation

---

## 3. Role Model

FlowForge uses three organization roles:

- **Owner**
- **Editor**
- **Viewer**

Authorization is enforced by Hasura permissions and backend checks. The frontend is not the security boundary.

### Capability Matrix

| Capability | Owner | Editor | Viewer |
|---|:---:|:---:|:---:|
| View organization workflows | Yes | Yes | Yes |
| View workflow steps | Yes | Yes | Yes |
| Create workflows | Yes | Yes | No |
| Edit normal workflow steps | Yes | Yes | No |
| Configure `db_write` steps | Yes | No | No |
| Configure `notify` steps | Yes | No | No |
| Configure webhook triggers | Yes | No | No |
| Configure normal triggers | Yes | Yes | No |
| Run workflows | Yes | Yes | No |
| Approve paused workflow steps | Yes | Yes | No |
| Manage organization membership | Yes | No | No |
| Access another organization | No | No | No |

### Important authorization detail

Editors can build and modify normal workflow functionality, but they cannot configure the sensitive workflow capabilities:

```text
db_write
notify
webhook trigger
```

An existing workflow that contains an Owner-configured sensitive step can still be executed by an authorized Owner/Editor; the restriction is primarily on configuring those sensitive capabilities.

Viewers have read-only access.

Organization isolation is enforced using the authenticated Nhost user identity and organization membership.

---

## 4. Workflow Step Types

The execution engine supports six step types.

### `llm_call`

Calls Google Gemini and stores the generated output in the step run.

```text
Input
  ↓
Google Gemini
  ↓
Output
```

LLM failures use the project's retry mechanism.

### `http_request`

Executes an external HTTP request.

Example configuration:

```json
{
  "method": "GET",
  "url": "https://example.com",
  "headers": {},
  "body": {}
}
```

HTTP failures use the project's retry mechanism.

### `conditional_branch`

Evaluates workflow output and chooses the next workflow position.

The demo workflow checks whether the previous LLM output contains:

```text
APPROVE
```

Example:

```text
TRUE  → Approval Gate
FALSE → alternate path
```

### `approval_gate`

Pauses execution and persists the paused state.

```text
step_run.status     = paused
workflow_run.status = paused
```

The original request is released. Approval later resumes the existing workflow run.

### `db_write`

Persists workflow output into:

```text
workflow_results
```

Configuration of this step is restricted to Owners.

### `notify`

Creates a notification event in:

```text
notification_events
```

The notification event can be delivered to the backend through a Hasura Event Trigger.

Configuration of this step is restricted to Owners.

---

## 5. Workflow Triggers

FlowForge supports four trigger types:

```text
manual
webhook
scheduled
database_event
```

### Manual

The authenticated user starts a workflow through the dashboard.

### Webhook

An external system starts a workflow through a signed webhook request.

### Scheduled

The backend scheduler polls enabled scheduled triggers and starts workflows according to their configured interval.

### Database Event

A Hasura Event Trigger can call the backend when a configured database operation occurs. The backend matches the event against enabled `database_event` workflow triggers and starts the matching workflows.

---

## 6. Workflow Run Lifecycle

Workflow runs use these statuses:

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

Failure:

```text
running
  ↓
failed
```

Approval resume uses the existing persisted workflow run rather than creating a second run.

---

## 7. Architecture

```text
                         ┌──────────────────────┐
                         │      React UI        │
                         │        Vite          │
                         └──────────┬───────────┘
                                    │
                              Nhost Auth
                                    │
                             GraphQL / WS
                                    │
                         ┌──────────▼───────────┐
                         │       Hasura         │
                         │ GraphQL + Permissions│
                         │ Actions + Events     │
                         └───────┬───────┬──────┘
                                 │       │
                            PostgreSQL   │ Actions
                                        │
                               ┌────────▼─────────┐
                               │ Node.js / Express │
                               │ Workflow Engine   │
                               └────────┬──────────┘
                                        │
                  ┌─────────────────────┼─────────────────────┐
                  │                     │                     │
                  ▼                     ▼                     ▼
              Google Gemini        External HTTP        PostgreSQL
                  │                     │                     │
                  └─────────────────────┼─────────────────────┘
                                        │
                                        ▼
                                 Pause / Resume
```

### Request and execution flow

```text
React
  ↓
Nhost authentication
  ↓
Hasura GraphQL / Action
  ↓
Node.js backend
  ↓
Authorization
  ↓
Quota check
  ↓
Workflow run
  ↓
Step execution
  ↓
Persist step state
  ↓
Hasura subscription
  ↓
React live progress
```

---

## 8. Project Structure

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

## 9. Database Schema

PostgreSQL is managed through Nhost/Hasura.

### `organizations`

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

### `org_members`

```text
org_members
├── id
├── organization_id
├── user_id
├── role
└── created_at
```

Membership is unique per organization/user pair.

### `workflows`

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

### `workflow_steps`

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

The `(workflow_id, position)` combination is unique.

### `workflow_triggers`

```text
workflow_triggers
├── id
├── workflow_id
├── type
├── config JSONB
├── enabled
└── created_at
```

Supported types:

```text
manual
webhook
scheduled
database_event
```

### `workflow_runs`

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

`created_at` represents creation of the workflow-run record. `started_at` represents execution start time.

### `step_runs`

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
├── completed_at
└── created_at
```

`step_runs` provides durable execution history for the live progress UI.

### `workflow_results`

```text
workflow_results
├── id
├── workflow_id
├── workflow_run_id
├── step_run_id
├── data JSONB
└── created_at
```

### `notification_events`

```text
notification_events
├── id
├── workflow_id
├── workflow_run_id
├── step_run_id
├── channel
├── payload JSONB
├── status
├── created_at
├── processed_at
└── error
```

### Monthly usage view

The project also includes:

```text
organization_usage_this_month
```

This view exposes organization usage information used by the dashboard, including quota fields and completed workflow-run counts for the current month.

---

## 10. Quota Handling

Each organization has:

```text
quota_limit
quota_used
quota_period_start
```

Before a new workflow run is created, the backend reads the organization's quota and performs an atomic conditional increment through Hasura.

Conceptually:

```text
quota_used < quota_limit
        ↓
increment quota_used
        ↓
allow workflow
```

If no quota remains:

```text
QUOTA_EXCEEDED
```

is returned and the workflow is not started.

The dashboard displays organization usage.

---

## 11. Retry Handling

LLM and HTTP steps use the retry service.

The attempt count is persisted in:

```text
step_runs.attempt_count
```

The execution pattern is:

```text
Attempt 1
   ↓
failure
   ↓
retry
   ↓
Attempt 2
```

If execution cannot recover:

```text
step_run.status = failed
workflow_run.status = failed
```

The error is persisted for workflow history and debugging.

---

## 12. Durable Approval Flow

Approval is implemented as a persistent state transition rather than a long-running HTTP request.

### Pause

When `approval_gate` is reached:

```text
step_run.status = paused
workflow_run.status = paused
```

The backend returns control.

### Approve

The `approveStep` action validates:

1. Authentication
2. Workflow existence
3. Organization membership
4. Required role
5. Approval step type
6. Paused state

Then it records:

```text
approved_by
approved_at
```

and resumes the existing workflow run.

### Resume

```text
paused workflow_run
       ↓
approveStep
       ↓
persist approval
       ↓
status = running
       ↓
continue from next step
```

This prevents duplicate workflow runs during approval.

---

## 13. Hasura Actions

The repository metadata defines three Actions.

### `triggerWorkflowRun`

Arguments:

```text
workflow_id: UUID!
```

Handler:

```text
/actions/trigger-workflow-run
```

Purpose:

```text
authenticate
   ↓
authorize organization membership
   ↓
check quota
   ↓
create workflow run
   ↓
execute workflow
```

### `approveStep`

Argument:

```text
step_run_id: UUID!
```

Handler:

```text
/actions/approve-step
```

Purpose:

```text
authenticate
   ↓
authorize organization membership
   ↓
validate approval state
   ↓
record approval
   ↓
resume workflow
```

### `triggerWorkflowWebhook`

Arguments:

```text
workflow_id: UUID!
secret: String!
payload: String
```

Handler:

```text
/actions/trigger-workflow-webhook
```

Purpose:

```text
receive signed webhook action
       ↓
find enabled webhook trigger
       ↓
validate trigger secret
       ↓
parse payload
       ↓
execute workflow
```

This Action is configured for the public role because the backend validates the configured webhook secret.

---

## 14. Webhook Execution

The server exposes two webhook-related workflow entry points.

### Direct workflow webhook

```text
POST /webhooks/workflow/:workflowId
```

Required header:

```text
x-webhook-secret: YOUR_SECRET
```

Example:

```bash
curl -X POST \
  https://YOUR-BACKEND-URL/webhooks/workflow/WORKFLOW_ID \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{"customer":"Demo Customer","amount":5000}'
```

The workflow run is created with:

```text
trigger_type = webhook
```

### Hasura Action webhook

```text
POST /actions/trigger-workflow-webhook
```

The Action accepts:

```text
workflow_id
secret
payload
```

and performs the same secret validation before execution.

---

## 15. Scheduled Workflows

The backend scheduler starts automatically unless:

```env
SCHEDULER_ENABLED=false
```

The polling interval is controlled by:

```env
SCHEDULER_POLL_MS=30000
```

The scheduler:

1. Finds enabled `scheduled` triggers.
2. Reads their configured interval.
3. Checks `last_run_at`.
4. Updates `last_run_at`.
5. Starts the workflow when the interval has elapsed.

The minimum polling interval enforced by the server is 15 seconds.

---

## 16. Database Event Workflows

The server exposes:

```text
POST /events/database
```

A Hasura Event Trigger can call this endpoint.

The handler:

1. Validates the configured event secret when enabled.
2. Reads the database event.
3. Finds enabled `database_event` workflow triggers.
4. Matches the source table and operation.
5. Starts matching workflows.
6. Prevents a workflow from recursively triggering itself from its own result row.

The event secret is configured through:

```env
FLOWFORGE_EVENT_SECRET=
```

---

## 17. Notification Events

The `notify` step creates a row in:

```text
notification_events
```

The server exposes:

```text
POST /events/notification
```

A Hasura Event Trigger can listen for inserts and call this endpoint.

Conceptually:

```text
notify step
    ↓
notification_events INSERT
    ↓
Hasura Event Trigger
    ↓
POST /events/notification
    ↓
Node.js handler
```

The event secret can be validated through:

```env
FLOWFORGE_EVENT_SECRET=
```

---

## 18. Live Workflow Progress

The React client uses a GraphQL WebSocket subscription for `step_runs`.

The subscription is scoped to:

```text
workflow_run_id
```

This allows the UI to react to persisted state changes without polling the entire dashboard.

Example:

```text
queued
  ↓
running
  ↓
step 1 completed
  ↓
step 2 running
  ↓
paused
```

After approval:

```text
paused
  ↓
running
  ↓
completed
```

---

## 19. Demo Workflow

The dashboard includes an Owner-only demo workflow creation flow.

The demo workflow contains:

```text
1. Analyze Request
   llm_call

2. Fetch External Data
   http_request

3. Check Decision
   conditional_branch

4. Manager Approval
   approval_gate

5. Save Result
   db_write
```

The demo HTTP step uses:

```text
https://jsonplaceholder.typicode.com/todos/1
```

The conditional branch checks whether the LLM output contains:

```text
APPROVE
```

This provides a compact demonstration of:

```text
AI
 ↓
HTTP
 ↓
Decision
 ↓
Human approval
 ↓
Persistence
```

---

## 20. Technology Stack

### Frontend

- React 19
- Vite 8
- React Router
- Nhost React
- Nhost JavaScript SDK
- Apollo Client
- GraphQL
- Tailwind CSS dependency
- Custom CSS

### Authentication

- Nhost Auth

### API / Authorization

- Hasura GraphQL
- Hasura permissions
- Hasura Actions
- Hasura Event Triggers

### Backend

- Node.js
- Express 5
- `graphql-request`
- Axios
- CORS
- dotenv

### AI

- Google Gemini
- `@google/genai`

### Database

- PostgreSQL through Nhost/Hasura

### Development

- npm
- Nodemon
- Vite
- Oxlint

---

## 21. Environment Variables

The repository provides:

```text
.env.example
```

### Frontend

The current client uses the Nhost configuration required by the frontend.

Example:

```env
VITE_NHOST_SUBDOMAIN=
VITE_NHOST_REGION=
```

If your deployment uses explicit GraphQL endpoints, configure the corresponding client variables required by the current frontend configuration.

### Backend

```env
PORT=5000

HASURA_GRAPHQL_URL=
HASURA_ADMIN_SECRET=

GEMINI_API_KEY=

CORS_ORIGINS=
SCHEDULER_ENABLED=
SCHEDULER_POLL_MS=

FLOWFORGE_EVENT_SECRET=
```

Server-side secrets must never be exposed to the frontend.

In particular:

```text
HASURA_ADMIN_SECRET
GEMINI_API_KEY
FLOWFORGE_EVENT_SECRET
```

must remain server-side.

---

## 22. Local Development

### Prerequisites

Install:

- Node.js
- npm
- Git
- An Nhost project
- PostgreSQL/Hasura through Nhost
- Google Gemini API access

### Clone

```bash
git clone https://github.com/harshitsingh3604/flowforge-ai.git
cd flowforge-ai
```

### Frontend

```bash
cd client
npm install
npm run dev
```

The Vite development server normally runs at:

```text
http://localhost:5173
```

### Backend

Open another terminal:

```bash
cd server
npm install
npm run dev
```

The backend normally runs at:

```text
http://localhost:5000
```

Health check:

```text
GET /health
```

Expected response:

```json
{
  "success": true,
  "service": "flowforge-ai-server",
  "status": "healthy",
  "timestamp": "..."
}
```

---

## 23. Production Build

### Frontend

```bash
cd client
npm install
npm run build
```

Preview:

```bash
npm run preview
```

Lint:

```bash
npm run lint
```

### Backend

```bash
cd server
npm install
npm start
```

The server starts on:

```env
PORT=5000
```

or the port supplied by the deployment platform.

---

## 24. Hasura / Nhost Setup

The repository contains:

```text
hasura/migrations/default/001_initial_schema/
hasura/metadata/metadata.json
```

The initial database migration creates the application's core tables, constraints, indexes, and usage view.

After configuring the Nhost project:

1. Apply the database migration.
2. Apply/import Hasura metadata.
3. Verify relationships.
4. Verify organization membership permissions.
5. Verify workflow permissions.
6. Verify step permissions.
7. Verify trigger permissions.
8. Configure the three Hasura Actions.
9. Configure the notification Event Trigger.
10. Configure database-event Event Trigger behavior if required.
11. Ensure all cloud handlers point to the public backend URL.

Do not configure cloud Hasura Actions to call:

```text
http://localhost:5000
```

For local development where cloud Hasura must call your local server, use a secure public HTTPS tunnel.

---

## 25. Deployment Architecture

A typical deployment is:

```text
                    Internet
                       |
             +---------+---------+
             |                   |
             ▼                   ▼
        Vercel Frontend     Node/Express Backend
             |                   |
             +---------+---------+
                       |
                     Nhost
                       |
              +--------+--------+
              |                 |
           Hasura          PostgreSQL
```

### Frontend

Deploy the Vite client.

Build:

```bash
cd client
npm run build
```

### Backend

Deploy the Express server with a public HTTPS URL.

### Hasura Actions

The repository metadata currently points the Actions to the deployed Render backend:

```text
https://flowforge-ai-nmnc.onrender.com/actions/approve-step
https://flowforge-ai-nmnc.onrender.com/actions/trigger-workflow-run
https://flowforge-ai-nmnc.onrender.com/actions/trigger-workflow-webhook
```

If deploying elsewhere, update the Hasura Action handlers accordingly.

---

## 26. Demo Accounts

The assessment/demo setup uses:

| Account | Email | Organization | Role |
|---|---|---|---|
| Owner A | `owner.a@acme.example` | Acme/Organization A | Owner |
| Editor A | `editor.a@acme.example` | Acme/Organization A | Editor |
| Viewer A | `viewer.a@acme.example` | Acme/Organization A | Viewer |
| Owner B | `owner.b@beta.example` | Beta/Organization B | Owner |

Do not commit real passwords to the repository.

Provide passwords separately through the assessment submission channel when required.

---

## 27. Recommended Evaluation Flow

### Owner Test

```text
Login as Owner
      ↓
Create demo workflow
      ↓
Run workflow
      ↓
LLM
      ↓
HTTP
      ↓
Conditional
      ↓
Approval Gate
      ↓
PAUSED
      ↓
Approve
      ↓
DB Write
      ↓
COMPLETED
```

### Editor Test

Verify that an Editor can:

```text
View workflows
Create workflows
Edit normal steps
Configure normal triggers
Run workflows
Approve paused workflow steps
```

Verify that an Editor cannot configure:

```text
db_write
notify
webhook triggers
```

### Viewer Test

Verify:

```text
View workflows       ✓
View steps           ✓
Run workflow         ✗
Approve              ✗
Create workflow      ✗
Edit workflow        ✗
```

### Cross-Organization Test

```text
Organization A
  Owner A

Organization B
  Owner B
```

Owner A must not be able to read or modify Organization B workflow data.

---

## 28. Security Model

FlowForge uses multiple authorization layers.

### Frontend

The UI is role-aware and hides/disables operations that the current user cannot perform.

### Hasura

Hasura permissions enforce:

- organization membership
- role-based workflow access
- workflow-step restrictions
- workflow-trigger restrictions
- organization-level access

### Backend

The backend validates:

- authentication context
- workflow existence
- organization membership
- role
- workflow state
- quota
- approval state
- webhook secrets

### Secrets

Never expose:

```text
HASURA_ADMIN_SECRET
GEMINI_API_KEY
FLOWFORGE_EVENT_SECRET
```

through:

```text
client code
VITE_* variables
GitHub
browser storage
public README files
```

---

## 29. Important API Endpoints

### Health

```text
GET /health
```

### Hasura Action: workflow run

```text
POST /actions/trigger-workflow-run
```

### Hasura Action: approval

```text
POST /actions/approve-step
```

### Hasura Action: webhook workflow

```text
POST /actions/trigger-workflow-webhook
```

### Direct workflow webhook

```text
POST /webhooks/workflow/:workflowId
```

### Notification Event

```text
POST /events/notification
```

### Database Event

```text
POST /events/database
```

---

## 30. Useful Commands

### Frontend

```bash
cd client
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

### Backend

```bash
cd server
npm install
npm run dev
npm start
```

### Git

```bash
git status
git add .
git commit -m "Update FlowForge"
git push
```

---

## 31. Production Verification Checklist

Before an assessment/demo deployment, verify:

- [ ] Login works.
- [ ] Logout works.
- [ ] Invalid credentials show a useful error.
- [ ] Owner can create a workflow.
- [ ] Editor can create a workflow.
- [ ] Viewer cannot create a workflow.
- [ ] Owner can configure `db_write`.
- [ ] Editor cannot configure `db_write`.
- [ ] Owner can configure `notify`.
- [ ] Editor cannot configure `notify`.
- [ ] Owner can configure webhook triggers.
- [ ] Editor cannot configure webhook triggers.
- [ ] Owner can run workflows.
- [ ] Editor can run workflows.
- [ ] Viewer cannot run workflows.
- [ ] Owner can approve paused workflow steps.
- [ ] Editor can approve paused workflow steps.
- [ ] Viewer cannot approve.
- [ ] LLM execution works.
- [ ] HTTP execution works.
- [ ] Conditional branching works.
- [ ] Approval gate persists `paused`.
- [ ] Approval resumes the same workflow run.
- [ ] DB write persists workflow results.
- [ ] Notification events are created.
- [ ] Retry count is persisted.
- [ ] Quota exhaustion returns `QUOTA_EXCEEDED`.
- [ ] Manual trigger works.
- [ ] Webhook trigger validates its secret.
- [ ] Scheduled trigger works when enabled.
- [ ] Database-event trigger validates its event secret.
- [ ] Step-run subscription updates the UI.
- [ ] Organization A cannot access Organization B.
- [ ] No privileged secrets are committed.
- [ ] Frontend production build succeeds.
- [ ] Backend health endpoint responds successfully.
- [ ] Hasura Action URLs are publicly reachable in production.
- [ ] Event Trigger URLs are publicly reachable in production.

---

## 32. Assessment Highlights

FlowForge demonstrates:

### Multi-tenancy

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

### Role-based authorization

```text
Owner
Editor
Viewer
```

### AI/API orchestration

```text
LLM
 ↓
HTTP
 ↓
Conditional
```

### Human-in-the-loop execution

```text
Workflow
   ↓
Approval Gate
   ↓
Persist PAUSED
   ↓
Approve
   ↓
Resume
   ↓
Complete
```

### Event-driven execution

```text
Database Event / Notification Event
              ↓
        Hasura Event Trigger
              ↓
        Node.js webhook
              ↓
        Workflow engine
```

### Live execution monitoring

```text
PostgreSQL
    ↓
Hasura
    ↓
GraphQL WebSocket
    ↓
React
```

---

## 33. Project Scope

FlowForge AI is intentionally scoped as a focused workflow-control-plane assessment project.

The implementation prioritizes:

- organization isolation
- role-based authorization
- durable workflow execution
- AI/API orchestration
- human approval
- persistent workflow state
- retries
- quotas
- webhook execution
- scheduled execution
- database-event execution
- notification events
- live execution visibility

It does not attempt to be a complete commercial automation platform with a large visual workflow canvas, enterprise billing, complex scheduling, or a full external notification-provider ecosystem.

The goal is to demonstrate the core engineering architecture clearly and make the authorization and execution behavior easy to evaluate.

---

## 34. Future Improvements

Potential future improvements include:

- More workflow step types
- More sophisticated scheduling
- Background worker queues
- Distributed execution
- Idempotency keys
- Stronger webhook signing
- External notification providers
- Workflow versioning
- Execution cancellation controls
- Better audit logging
- Automated integration tests
- More granular permissions
- A visual workflow canvas
- Production-grade observability

See:

```text
docs/future-improvements.md
```

for additional project ideas.

---

## 35. License / Assessment Use

FlowForge AI was created as a software engineering assessment project.

Unless otherwise specified by the repository owner, the repository is intended for assessment, demonstration, and evaluation purposes.

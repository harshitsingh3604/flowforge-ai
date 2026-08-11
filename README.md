# FlowForge AI

FlowForge AI is a small, assessment-focused AI workflow orchestration platform built around **React, Nhost, Hasura, PostgreSQL, and Node.js**.

It demonstrates a multi-tenant workflow control plane where organization members can create, view, execute, and approve workflows according to their role.

The implementation intentionally keeps the product scope small while demonstrating the important production-style concepts required by the assessment:

- Nhost authentication
- Organization-scoped multi-tenancy
- Owner / Editor / Viewer authorization
- Hasura GraphQL permissions
- Workflow execution through a Node.js engine
- LLM execution with Google Gemini
- HTTP requests
- Conditional branching
- Persistent approval gates
- Workflow resume after approval
- Database writes
- Notification events
- Retry handling
- Organization quotas
- Manual and webhook workflow triggers
- GraphQL step-run subscriptions for live progress

---

## 1. Product Overview

A workflow consists of ordered steps.

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

When an approval gate is reached, the workflow is persisted as paused rather than keeping an HTTP request open.

```text
workflow_run.status = paused
step_run.status     = paused
```

An authorized Owner/Editor can then approve the step:

```text
approveStep()
      ↓
approval recorded
      ↓
workflow resumed
      ↓
remaining steps execute
      ↓
COMPLETED
```

This makes the approval flow persistent and suitable for asynchronous execution.

---

## 2. Core Features

### Authentication

Authentication is handled by Nhost Auth.

The frontend uses the Nhost JavaScript SDK and maintains the authenticated session through a small React `AuthProvider`.

Supported operations:

- Sign in
- Sign out
- Current authenticated user
- Session persistence

The login UI displays a user-friendly error for invalid credentials.

### Multi-Tenancy

Every workflow belongs to an organization:

```text
organization
    ↓
workflow
    ↓
workflow steps
    ↓
workflow runs
    ↓
step runs
```

Organization membership is represented by:

```text
org_members
```

with the roles:

```text
owner
editor
viewer
```

Hasura permissions scope organization data using the authenticated Nhost user ID.

The application therefore does not rely only on frontend checks for tenant isolation.

---

## 3. Role Model

| Capability | Owner | Editor | Viewer |
|---|:---:|:---:|:---:|
| View organization workflows | Yes | Yes | Yes |
| View workflow steps | Yes | Yes | Yes |
| Create workflows | Yes | Yes | No |
| Edit normal workflow steps | Yes | Yes | No |
| Create/configure `db_write` | Yes | No | No |
| Create/configure `notify` | Yes | No | No |
| Run workflows | Yes | Yes | No |
| Approve workflow steps | Yes | Yes | No |
| Manage organization membership | Yes | No | No |
| Access another organization | No | No | No |

The final authorization decision is enforced through the backend/Hasura authorization model, not only by hiding UI buttons.

---

## 4. Workflow Step Types

The workflow engine supports six step types.

### `llm_call`

Calls Google Gemini and stores the generated result in the step run.

```text
Input
  ↓
Gemini
  ↓
Output
```

Retry support is available for LLM failures.

### `http_request`

Executes a real HTTP request.

Supported configuration includes:

```json
{
  "method": "GET",
  "url": "https://example.com",
  "headers": {},
  "body": {}
}
```

Retry support is available for failed requests.

### `conditional_branch`

Evaluates workflow output and chooses the next position.

The demo workflow uses:

```text
Does the previous LLM output contain "APPROVE"?
```

Example:

```text
TRUE  → Approval Gate
FALSE → alternate path
```

### `approval_gate`

Pauses workflow execution.

When reached:

```text
step_run.status = paused
workflow_run.status = paused
```

The engine returns control without keeping the original request open.

### `db_write`

Stores workflow output in:

```text
workflow_results
```

This step is restricted to Owner-level workflow configuration/execution according to the project's authorization model.

### `notify`

Creates a notification event in:

```text
notification_events
```

The notification event can then be processed through a Hasura Event Trigger.

---

## 5. Workflow Run Lifecycle

Workflow runs use the following statuses:

```text
queued
running
paused
completed
failed
cancelled
```

A normal execution looks like:

```text
queued
  ↓
running
  ↓
completed
```

An approval workflow looks like:

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

If an unrecoverable error occurs:

```text
running
  ↓
failed
```

---

## 6. Architecture

```text
                         ┌──────────────────────┐
                         │      React UI        │
                         │       Vite           │
                         └──────────┬───────────┘
                                    │
                              Nhost Auth
                                    │
                              GraphQL + JWT
                                    │
                         ┌──────────▼───────────┐
                         │       Hasura         │
                         │ GraphQL + Permissions│
                         └───────┬───────┬──────┘
                                 │       │
                         PostgreSQL      │ Actions
                                         │
                                ┌────────▼─────────┐
                                │ Node.js / Express │
                                │ Workflow Engine   │
                                └────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
                  Gemini             HTTP APIs          PostgreSQL
                    │                    │                    │
                    └────────────────────┼────────────────────┘
                                         │
                                         ▼
                                  Approval / Resume
```

---

## 7. Project Structure

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
│   │   │
│   │   ├── pages/
│   │   │   └── Dashboard.jsx
│   │   │
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   │
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── actions/
│   │   │   ├── approveStep.js
│   │   │   └── triggerWorkflowRun.js
│   │   │
│   │   ├── engine/
│   │   │   ├── executeStep.js
│   │   │   └── executeWorkflow.js
│   │   │
│   │   ├── services/
│   │   │   ├── authorization.js
│   │   │   ├── hasura.js
│   │   │   ├── quota.js
│   │   │   └── retry.js
│   │   │
│   │   ├── steps/
│   │   │   ├── approvalGate.js
│   │   │   ├── conditionalBranch.js
│   │   │   ├── dbWrite.js
│   │   │   ├── httpRequest.js
│   │   │   ├── llmCall.js
│   │   │   └── notify.js
│   │   │
│   │   ├── webhooks/
│   │   │   ├── notificationEvent.js
│   │   │   └── workflowWebhook.js
│   │   │
│   │   └── server.js
│   │
│   └── package.json
│
├── hasura/
│   ├── metadata/
│   └── migrations/
│       └── default/
│           └── 001_initial_schema/
│               ├── up.sql
│               └── down.sql
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 8. Database Schema

The project uses PostgreSQL through Nhost/Hasura.

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

Unique membership:

```text
UNIQUE(organization_id, user_id)
```

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

The `(workflow_id, position)` combination is unique.

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
├── completed_at
└── created_at
```

`step_runs` is the persistent execution history used by the live workflow progress UI.

### Workflow Results

```text
workflow_results
├── id
├── workflow_id
├── workflow_run_id
├── step_run_id
├── data JSONB
└── created_at
```

### Notification Events

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

---

## 9. Quota Handling

Each organization has:

```text
quota_limit
quota_used
quota_period_start
```

Before a workflow starts, the backend checks the organization's available quota.

If the quota has been exhausted, execution is rejected with:

```text
QUOTA_EXCEEDED
```

Completed runs increment usage.

The dashboard displays the current organization usage.

---

## 10. Retry Handling

LLM and HTTP steps use a small retry mechanism.

Current behavior:

```text
Attempt 1
   ↓
failure
   ↓
Attempt 2
```

The attempt count is persisted in:

```text
step_runs.attempt_count
```

If all attempts fail:

```text
step_run.status = failed
workflow_run.status = failed
```

The error is stored for debugging and workflow history.

---

## 11. Approval Flow

Approval is implemented as a persistent state transition.

### Before approval

```text
workflow_run.status = paused
step_run.status = paused
```

The original request is not kept open.

### Approval request

```text
approveStep(step_run_id)
```

The backend validates:

1. User is authenticated.
2. User belongs to the workflow's organization.
3. User has the required role.
4. The step is an approval gate.
5. The step is currently paused.

Then:

```text
approved_by = current user
approved_at = current timestamp
```

The workflow is resumed from the next step.

---

## 12. GraphQL Actions

Two Hasura Actions provide the main workflow commands.

### `triggerWorkflowRun`

Input:

```text
workflow_id: UUID
```

Flow:

```text
Hasura Action
      ↓
authenticate
      ↓
organization authorization
      ↓
quota check
      ↓
create workflow_run
      ↓
execute workflow
```

Output:

```text
success
workflowRunId
status
message
```

### `approveStep`

Input:

```text
step_run_id: UUID
```

Flow:

```text
Hasura Action
      ↓
authenticate
      ↓
organization authorization
      ↓
role check
      ↓
approval-state check
      ↓
approve
      ↓
resume workflow
```

Output:

```text
success
workflowRunId
status
message
```

---

## 13. Webhook Trigger

A workflow can also be started through a webhook.

Endpoint:

```text
POST /webhooks/workflow/:workflowId
```

The webhook expects the configured webhook secret.

Example:

```bash
curl -X POST \
  https://YOUR-BACKEND-URL/webhooks/workflow/WORKFLOW_ID \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: demo-secret" \
  -d '{"customer":"Demo Customer","amount":5000}'
```

The request starts a workflow run using:

```text
trigger_type = webhook
```

---

## 14. Notification Event Trigger

The backend exposes:

```text
POST /events/notification
```

The `notify` workflow step creates a row in:

```text
notification_events
```

A Hasura Event Trigger can listen for inserts on that table and call the notification webhook.

Recommended production configuration:

```text
notification_events INSERT
        ↓
Hasura Event Trigger
        ↓
POST /events/notification
        ↓
Node.js notification handler
```

---

## 15. Live Workflow Progress

The frontend uses a GraphQL WebSocket subscription for `step_runs`.

The subscription is scoped to the exact:

```text
workflow_run_id
```

This allows the UI to update as execution progresses:

```text
queued
  ↓
running
  ↓
completed
```

or:

```text
running
  ↓
paused
```

without requiring a full page refresh.

---

## 16. Technology Stack

### Frontend

- React 19
- Vite
- Nhost JavaScript SDK
- GraphQL
- Custom responsive CSS

### Authentication

- Nhost Auth

### API / Authorization

- Hasura GraphQL
- Hasura permissions
- Hasura Actions
- Hasura Event Triggers

### Backend

- Node.js
- Express
- GraphQL requests
- HTTP execution

### Database

- PostgreSQL through Nhost

### AI

- Google Gemini via `@google/genai`

### Development

- npm
- Vite
- Nodemon
- Oxlint

---

## 17. Environment Variables

### Frontend

Create:

```text
client/.env
```

with:

```env
VITE_NHOST_SUBDOMAIN=YOUR_NHOST_SUBDOMAIN
VITE_NHOST_REGION=YOUR_NHOST_REGION
VITE_NHOST_GRAPHQL_URL=YOUR_NHOST_GRAPHQL_URL
VITE_NHOST_GRAPHQL_WS_URL=YOUR_NHOST_GRAPHQL_WS_URL
```

The frontend must never contain:

```text
HASURA_ADMIN_SECRET
```

or any other server-side privileged secret.

### Backend

Create:

```text
server/.env
```

with:

```env
PORT=5000

HASURA_GRAPHQL_URL=YOUR_HASURA_GRAPHQL_URL
HASURA_ADMIN_SECRET=YOUR_HASURA_ADMIN_SECRET

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```

`HASURA_ADMIN_SECRET` must remain server-side only.

---

## 18. Local Development

### Prerequisites

Install:

- Node.js
- npm
- Git
- An Nhost project
- A configured Hasura/PostgreSQL database
- A Gemini API key

### Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd flowforge-ai
```

### Install frontend dependencies

```bash
cd client
npm install
```

### Configure frontend environment

Create:

```text
client/.env
```

and add the Nhost values described above.

### Start frontend

```bash
npm run dev
```

The Vite development server normally runs at:

```text
http://localhost:5173
```

### Install backend dependencies

Open another terminal:

```bash
cd server
npm install
```

Create:

```text
server/.env
```

and configure the Hasura and Gemini credentials.

### Start backend

```bash
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
  "status": "healthy"
}
```

---

## 19. Nhost / Hasura Setup

The database migration is located at:

```text
hasura/migrations/default/001_initial_schema/up.sql
```

The repository also contains Hasura metadata.

After configuring the Nhost project:

1. Configure PostgreSQL schema.
2. Track the required tables/views in Hasura.
3. Configure relationships.
4. Configure Hasura permissions.
5. Configure `triggerWorkflowRun`.
6. Configure `approveStep`.
7. Configure the notification Event Trigger.
8. Make sure Action/Event Trigger URLs point to a publicly reachable backend in deployed environments.

Do not point cloud Hasura Actions to:

```text
http://localhost:5000
```

For local development, use a secure public tunnel such as an ngrok HTTPS URL when Hasura Cloud needs to call your local server.

---

## 20. Demo Workflow

The dashboard provides an Owner-only `+ Demo` action.

It creates the assessment demonstration workflow:

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

The conditional checks whether the LLM output contains:

```text
APPROVE
```

---

## 21. Recommended Evaluation Flow

### Owner

Sign in as an Owner and:

```text
Create Demo Workflow
        ↓
Run
        ↓
LLM
        ↓
HTTP
        ↓
Conditional
        ↓
Approval
        ↓
PAUSED
        ↓
Approve
        ↓
DB Write
        ↓
COMPLETED
```

### Editor

Sign in as an Editor and verify the permissions expected by the assessment.

Editors can work with normal workflow functionality but cannot configure Owner-only sensitive steps such as `db_write` and `notify`.

### Viewer

Sign in as a Viewer.

Expected:

```text
Read workflows       ✓
Read steps           ✓
Run workflow         ✗
Approve              ✗
Create/update        ✗
```

### Cross-Organization Test

Use an Owner from another organization.

For example:

```text
Organization A
    Owner A

Organization B
    Owner B
```

Owner A must not be able to access Organization B workflow data.

---

## 22. Demo Credentials

The application uses Nhost Authentication.

The recommended assessment accounts are:

| Account | Email | Organization | Role |
|---|---|---|---|
| Owner A | `owner.a@acme.example` | Organization A | Owner |
| Editor A | `editor.a@acme.example` | Organization A | Editor |
| Viewer A | `viewer.a@acme.example` | Organization A | Viewer |
| Owner B | `owner.b@beta.example` | Organization B | Owner |

### Passwords

Do not commit real passwords to a public Git repository.

For an assessment submission, provide the passwords separately in the submission email or assessment portal unless the assessment explicitly permits credentials to be stored in the repository.

---

## 23. Security Considerations

The project uses several layers of authorization.

### Frontend

The UI disables operations unavailable to the current role.

### Hasura

Hasura permissions enforce organization and role-based data access.

### Backend

The workflow engine validates authentication, organization membership, roles, quota, and workflow state before execution.

### Secrets

Privileged credentials must remain server-side:

```text
HASURA_ADMIN_SECRET
GEMINI_API_KEY
```

Never expose them through:

```text
client/.env
VITE_*
GitHub
browser code
```

---

## 24. Production Deployment

The recommended deployment topology is:

```text
                    Internet
                       |
             +---------+---------+
             |                   |
             v                   v
        Vercel Frontend     Node Backend
             |                   |
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

Build:

```bash
cd client
npm run build
```

Deploy the generated Vite application to your preferred frontend platform.

Configure:

```env
VITE_NHOST_SUBDOMAIN=
VITE_NHOST_REGION=
VITE_NHOST_GRAPHQL_URL=
VITE_NHOST_GRAPHQL_WS_URL=
```

### Backend

Deploy the Node/Express server to a platform that provides a public HTTPS URL.

Configure:

```env
PORT=
HASURA_GRAPHQL_URL=
HASURA_ADMIN_SECRET=
GEMINI_API_KEY=
```

### Hasura Actions

Update:

```text
triggerWorkflowRun
approveStep
```

to point to the deployed backend.

For example:

```text
https://YOUR-BACKEND-DOMAIN/actions/trigger-workflow-run
https://YOUR-BACKEND-DOMAIN/actions/approve-step
```

The notification Event Trigger should point to:

```text
https://YOUR-BACKEND-DOMAIN/events/notification
```

---

## 25. Production Verification Checklist

Before submitting, verify:

- [ ] Login works from the deployed frontend.
- [ ] Invalid credentials display a useful error.
- [ ] Owner can create the demo workflow.
- [ ] Owner can run the workflow.
- [ ] LLM step executes.
- [ ] HTTP step executes.
- [ ] Conditional branch executes.
- [ ] Approval gate changes the run to `paused`.
- [ ] Approval resumes the existing run.
- [ ] DB write completes.
- [ ] Workflow reaches `completed`.
- [ ] Retry count is persisted.
- [ ] Quota enforcement works.
- [ ] Webhook trigger starts a workflow.
- [ ] Invalid webhook secret is rejected.
- [ ] Notification Event Trigger is configured and reachable.
- [ ] GraphQL step-run subscription updates the UI.
- [ ] Viewer cannot run workflows.
- [ ] Viewer cannot approve.
- [ ] Editor permissions match the assessment.
- [ ] Owner-only sensitive steps remain protected.
- [ ] Organization A cannot access Organization B data.
- [ ] No secrets are committed to Git.
- [ ] Frontend production build succeeds.
- [ ] Backend starts without configuration errors.
- [ ] Hasura Actions do not point to localhost in production.

---

## 26. Useful Commands

### Frontend

```bash
cd client
npm install
npm run dev
```

Production build:

```bash
npm run build
```

Lint:

```bash
npm run lint
```

Preview production build:

```bash
npm run preview
```

### Backend

```bash
cd server
npm install
npm run dev
```

Production:

```bash
npm start
```

### Git

```bash
git status
git add .
git commit -m "feat: finalize FlowForge workflow control plane"
git push
```

---

## 27. Assessment Highlights

FlowForge AI demonstrates the following engineering concepts:

### Multi-tenancy

```text
User
 ↓
Organization Membership
 ↓
Organization
 ↓
Workflow
```

### Role-based authorization

```text
Owner
Editor
Viewer
```

### Workflow orchestration

```text
LLM
 ↓
HTTP
 ↓
Conditional
 ↓
Approval
 ↓
DB
```

### Durable human-in-the-loop execution

```text
Approval Gate
     ↓
Persist PAUSED state
     ↓
Wait
     ↓
Approve
     ↓
Resume
```

### Event-driven architecture

```text
notification_events
       ↓
Hasura Event Trigger
       ↓
Node webhook
```

### Live execution monitoring

```text
PostgreSQL
     ↓
Hasura Subscription
     ↓
React UI
```

---

## 28. Project Scope

FlowForge AI is intentionally implemented as a focused assessment project rather than a full commercial workflow platform.

The priority is demonstrating:

- Correct authorization boundaries
- Organization isolation
- Durable workflow execution
- AI/API orchestration
- Human approval
- Persistent execution state
- Retry handling
- Quota enforcement
- Event-driven notification handling
- Live execution visibility

The project does not attempt to implement a large visual workflow editor, enterprise billing system, complex scheduling platform, or production notification provider integration.

This keeps the implementation small enough to understand and evaluate while demonstrating the required backend and frontend engineering concepts.

---

## 29. License

This project was created as a software engineering assessment project.

Unless otherwise specified by the repository owner, the source code is intended for assessment and demonstration purposes.
# FlowForge AI — Planning Document

## 1. Project Overview

FlowForge AI is an assessment-focused AI workflow orchestration application.

The application allows authenticated users to work with organization-scoped workflows. A workflow is composed of ordered steps that can execute AI processing, external HTTP requests, conditional logic, human approval, database persistence, and notifications.

The project is intentionally focused on demonstrating the required workflow-control-plane functionality rather than building a large visual workflow editor or a full commercial automation platform.

---

## 2. Project Goals

The main goals of the project are:

1. Implement Nhost authentication.
2. Implement organization-scoped multi-tenancy.
3. Implement Owner, Editor, and Viewer roles.
4. Store workflow definitions in PostgreSQL through Nhost/Hasura.
5. Expose workflow data through Hasura GraphQL.
6. Implement the required workflow step types.
7. Build a backend workflow execution engine.
8. Implement durable approval and resume behavior.
9. Implement workflow retries.
10. Implement organization quota checks.
11. Support manual workflow execution.
12. Support webhook workflow execution.
13. Persist workflow and step execution state.
14. Provide live step-run updates to the React UI.
15. Demonstrate the complete workflow from creation to completion.

---

## 3. Technology Plan

### Frontend

The frontend is implemented with:

- React
- Vite
- Nhost JavaScript SDK
- Nhost React integration
- GraphQL
- React Router dependency
- Tailwind CSS dependency
- Custom CSS for the current application UI

The main frontend responsibilities are:

- Authentication UI
- Dashboard
- Workflow selection
- Workflow execution
- Approval interaction
- Live workflow progress
- Usage display
- Role-aware UI controls

---

## 4. Backend Plan

The backend is implemented with:

- Node.js
- Express
- Hasura GraphQL
- `graphql-request`
- Google Gemini
- HTTP request execution
- Environment-based configuration

The backend is responsible for:

- Authentication context handling
- Workflow authorization
- Organization membership checks
- Quota enforcement
- Workflow run creation
- Workflow step execution
- Retry handling
- Approval processing
- Workflow resume
- Database result persistence
- Notification event creation
- Webhook workflow execution

---

## 5. Database Plan

The PostgreSQL schema is managed through Nhost/Hasura.

The initial migration creates the following tables:

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
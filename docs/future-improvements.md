# FlowForge AI — Future Improvements

This document describes improvements that can be added after the assessment version of FlowForge AI.

The current project intentionally focuses on the core assessment requirements. The items below are not required for the current submission and should be treated as future product and engineering work.

---

## 1. Visual Workflow Builder

### Current State

The current application creates the assessment demo workflow programmatically from the dashboard.

### Future Improvement

Build a visual drag-and-drop workflow editor.

Possible experience:

```text
Canvas
  │
  ├── LLM Call
  │
  ├── HTTP Request
  │
  ├── Conditional Branch
  │       ├── TRUE
  │       └── FALSE
  │
  ├── Approval Gate
  │
  └── DB Write
```

Users could:

- Add steps.
- Delete steps.
- Reorder steps.
- Connect branches.
- Edit configuration.
- Validate workflows before publishing.

---

## 2. Step Configuration UI

### Current State

Step configuration is stored in JSONB and the demo workflow defines configuration programmatically.

### Future Improvement

Add forms for each step type.

For example:

### LLM

```text
Model
Prompt
Temperature
Maximum tokens
```

### HTTP

```text
Method
URL
Headers
Body
Timeout
```

### Conditional

```text
Source step
Operator
Comparison value
True branch
False branch
```

### DB Write

```text
Target
Data mapping
```

### Notify

```text
Channel
Recipient
Message
```

This would allow users to create workflows without editing source code.

---

## 3. Workflow Versioning

### Current State

Workflows currently use the active workflow definition.

### Future Improvement

Introduce immutable workflow versions:

```text
Workflow
   │
   ├── Version 1
   ├── Version 2
   └── Version 3
```

Each workflow run would reference the exact version that was executed.

Benefits:

- Reproducible executions.
- Safer workflow updates.
- Rollback.
- Auditability.
- Easier debugging.

---

## 4. Draft and Published Workflows

### Future Improvement

Add workflow lifecycle states:

```text
draft
published
archived
```

Only published workflows would be executable.

This would separate workflow editing from production execution.

---

## 5. Stronger Webhook Security

### Current State

The webhook implementation supports a configured webhook secret.

### Future Improvement

Add:

- HMAC signatures.
- Timestamp validation.
- Replay protection.
- Secret rotation.
- Per-workflow credentials.
- Webhook request rate limits.

Example:

```text
Request
  ↓
Signature validation
  ↓
Timestamp validation
  ↓
Replay check
  ↓
Workflow execution
```

---

## 6. Scheduled Triggers

### Current State

The database supports:

```text
scheduled
```

as a trigger type, but the current assessment implementation demonstrates manual and webhook triggers.

### Future Improvement

Implement a scheduler service.

Example:

```text
Every day at 09:00
        ↓
Scheduler
        ↓
Workflow Run
```

Possible features:

- Cron expressions.
- Time zones.
- Pause/resume schedules.
- Next-run preview.
- Missed-run handling.

---

## 7. Database Event Triggers

### Current State

The schema supports:

```text
database_event
```

as a workflow trigger type.

### Future Improvement

Allow workflows to start automatically when a database event occurs.

Example:

```text
PostgreSQL INSERT
      ↓
Hasura Event Trigger
      ↓
FlowForge
      ↓
Workflow Run
```

---

## 8. Better Retry Policies

### Current State

LLM and HTTP steps have retry support.

### Future Improvement

Make retry behavior configurable per step.

Example:

```text
Maximum attempts: 5
Initial delay: 1 second
Backoff: exponential
Maximum delay: 30 seconds
Retry on:
  - timeout
  - 429
  - 5xx
```

A future retry configuration could be stored in each step's JSONB configuration.

---

## 9. Dead-Letter Handling

### Future Improvement

Add a dead-letter queue for workflows and steps that repeatedly fail.

Example:

```text
Workflow failure
      ↓
Retry exhausted
      ↓
Dead-letter record
      ↓
Manual investigation
```

The dashboard could provide:

- Failed execution list.
- Retry button.
- Error details.
- Failure history.

---

## 10. Better Observability

### Current State

Workflow and step errors are persisted.

### Future Improvement

Add structured logging and tracing.

Track:

```text
workflow_run_id
step_run_id
organization_id
user_id
duration
attempt
provider
error_code
```

This would make production debugging easier.

---

## 11. Execution Metrics

### Future Improvement

Add metrics such as:

```text
Workflow success rate
Average execution time
Step latency
LLM latency
HTTP latency
Retry rate
Approval wait time
Failure rate
Quota usage
```

The dashboard could display these as charts.

---

## 12. Audit Logs

### Future Improvement

Add a dedicated audit log.

Record actions such as:

```text
workflow.created
workflow.updated
workflow.deleted
workflow.run
workflow.paused
workflow.approved
workflow.failed
member.added
member.removed
role.changed
```

Each record could contain:

```text
user
organization
timestamp
action
resource
resource_id
metadata
```

This would improve enterprise security and traceability.

---

## 13. Better Approval Management

### Current State

The application supports a single approval gate.

### Future Improvement

Support:

- Multiple approvers.
- Approval groups.
- Approval deadlines.
- Escalation.
- Reject action.
- Approval comments.
- Approval history.
- Delegation.

Example:

```text
Approval Gate
     ↓
Owner approval
     ↓
Finance approval
     ↓
Continue
```

---

## 14. Approval Rejection

### Future Improvement

Add:

```text
Approve
Reject
```

A rejection could transition the workflow to:

```text
cancelled
```

or a dedicated:

```text
rejected
```

state.

The rejection reason should be stored with the step run.

---

## 15. Richer Conditional Logic

### Current State

The assessment implementation demonstrates a simple `contains` condition based on previous step output.

### Future Improvement

Support:

```text
equals
not_equals
contains
not_contains
greater_than
less_than
exists
regex
```

and allow nested expressions:

```text
AND
OR
NOT
```

Example:

```text
amount > 10000
AND
customer_risk == "low"
```

---

## 16. Data Mapping Between Steps

### Current State

The workflow engine passes execution context between steps.

### Future Improvement

Introduce explicit expression syntax.

Example:

```text
{{steps.analyze_request.output}}
{{steps.http_request.output.id}}
{{workflow.input.customer.email}}
```

This would make workflows easier to configure and understand.

---

## 17. Workflow Input Schema

### Future Improvement

Allow each workflow to define an input schema.

Example:

```json
{
  "customer": "string",
  "amount": "number",
  "priority": "string"
}
```

The system could validate manual and webhook inputs before execution.

---

## 18. API Credentials Management

### Current State

External integrations are represented by step configuration.

### Future Improvement

Introduce a secure credentials system.

Instead of storing credentials inside workflow configuration:

```text
workflow_steps.config
```

store references:

```text
credential_id
```

Secrets would be encrypted and never exposed to the frontend.

---

## 19. Integration Marketplace

### Future Improvement

Provide reusable integrations:

```text
Slack
Email
Discord
GitHub
Google Sheets
Notion
Jira
Linear
PostgreSQL
REST APIs
```

Each integration could expose one or more workflow steps.

---

## 20. Better Notification System

### Current State

The project creates notification events and provides a Hasura Event Trigger integration point.

### Future Improvement

Implement actual providers:

```text
Email
Slack
Microsoft Teams
Discord
SMS
```

Add delivery state:

```text
pending
sending
delivered
failed
```

and provider response tracking.

---

## 21. Workflow Run History

### Future Improvement

Create a dedicated execution history page.

Users could search:

```text
Workflow
Status
User
Trigger
Date
```

and inspect:

```text
Workflow Run
   ↓
Step Runs
   ↓
Inputs
Outputs
Errors
Attempts
Approvals
```

---

## 22. Workflow Replay

### Future Improvement

Allow users to replay a failed or completed run.

Possible options:

```text
Replay entire workflow
Replay from failed step
Replay from selected step
```

The replay should always create a new workflow run rather than mutating historical execution data.

---

## 23. Concurrency Controls

### Future Improvement

Prevent unwanted duplicate executions.

Possible controls:

```text
Allow concurrent runs
Limit to one active run
Maximum concurrent runs = N
Queue additional runs
```

This becomes especially useful for webhook-triggered workflows.

---

## 24. Rate Limiting

### Future Improvement

Add rate limiting to:

- Login attempts.
- Workflow triggers.
- Webhooks.
- Approval requests.
- Public API endpoints.

This would protect the backend from accidental or malicious high-frequency requests.

---

## 25. Background Job Queue

### Current State

The assessment implementation executes workflow steps through the Node.js workflow engine.

### Future Improvement

Introduce a durable job queue such as:

```text
Redis
BullMQ
```

Execution could become:

```text
Trigger
   ↓
Create workflow_run
   ↓
Queue job
   ↓
Worker
   ↓
Execute step
   ↓
Queue next step
```

This would improve scalability for long-running workflows.

---

## 26. Horizontal Worker Scaling

### Future Improvement

Run multiple workflow workers:

```text
              Queue
             /  |  \
            /   |   \
       Worker1 Worker2 Worker3
```

A distributed worker architecture would allow the platform to process more workflow runs concurrently.

---

## 27. Distributed Locking

### Future Improvement

Add locking around workflow runs and approval resumes.

This would prevent:

```text
Approve request A
Approve request B
```

from simultaneously resuming the same paused workflow.

Possible implementation:

- PostgreSQL row locks.
- Redis locks.
- Idempotency keys.

---

## 28. Idempotency

### Future Improvement

Add idempotency keys to workflow triggers and webhooks.

Example:

```text
Idempotency-Key: abc123
```

If the same request is received twice:

```text
Request 1 → workflow run created
Request 2 → existing run returned
```

This is especially important for webhook integrations.

---

## 29. Better Tenant Administration

### Future Improvement

Create organization administration screens for Owners.

Features:

- Invite member.
- Remove member.
- Change role.
- View organization usage.
- Manage quota.
- View audit logs.

---

## 30. Better Quota Management

### Current State

Quota is checked before new execution and usage is incremented after successful completion.

### Future Improvement

Support:

- Different quotas per plan.
- Monthly reset automation.
- Usage alerts.
- Soft limits.
- Hard limits.
- Per-step usage accounting.
- LLM token-based billing.

---

## 31. AI Provider Abstraction

### Current State

The project uses Google Gemini for the LLM step.

### Future Improvement

Introduce a provider abstraction:

```text
LLM Provider
    ├── Gemini
    ├── OpenAI
    ├── Anthropic
    └── Groq
```

Workflow configuration could choose the provider without changing the execution engine.

---

## 32. AI Cost Tracking

### Future Improvement

Record:

```text
model
input_tokens
output_tokens
total_tokens
estimated_cost
latency
```

per LLM step run.

This would allow organization-level AI usage reporting.

---

## 33. Better LLM Reliability

### Future Improvement

Add:

- Structured JSON output.
- Schema validation.
- Prompt versioning.
- Model fallback.
- Provider fallback.
- Timeout handling.
- Token limits.
- Content validation.

Example:

```text
Gemini failure
      ↓
Fallback provider
      ↓
Retry
      ↓
Failure
```

---

## 34. Testing

### Current State

The project has the core implementation and manual integration flow.

### Future Improvement

Add automated tests.

### Unit Tests

Test:

- Authorization.
- Quota.
- Retry.
- Conditional branch.
- Step dispatch.
- Approval validation.

### Integration Tests

Test:

```text
Trigger
 ↓
Workflow
 ↓
Pause
 ↓
Approve
 ↓
Resume
 ↓
Complete
```

### End-to-End Tests

Test:

```text
Login
 ↓
Dashboard
 ↓
Create workflow
 ↓
Run
 ↓
Approve
 ↓
Completed
```

---

## 35. TypeScript Migration

### Current State

The project is implemented in JavaScript/JSX.

### Future Improvement

Migrate to TypeScript.

Useful types would include:

```text
Workflow
WorkflowStep
WorkflowTrigger
WorkflowRun
StepRun
Organization
OrganizationMember
StepConfig
ExecutionContext
```

This would reduce runtime configuration errors and improve IDE support.

---

## 36. API Documentation

### Future Improvement

Document backend endpoints and Actions with OpenAPI or equivalent documentation.

Document:

```text
POST /webhooks/workflow/:workflowId
POST /events/notification
triggerWorkflowRun
approveStep
```

Include:

- Request schemas.
- Response schemas.
- Authentication.
- Error codes.
- Examples.

---

## 37. Better Error Codes

### Current State

The backend already uses explicit error codes in several important paths, including:

```text
QUOTA_EXCEEDED
APPROVAL_FORBIDDEN
INVALID_APPROVAL_STATE
WEBHOOK_NOT_ENABLED
INVALID_WEBHOOK_SECRET
```

### Future Improvement

Create one centralized error catalog.

Example:

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
WEBHOOK_NOT_ENABLED
INVALID_WEBHOOK_SECRET
```

This would make frontend error handling more predictable.

---

## 38. Better Frontend State Management

### Future Improvement

For a larger product, introduce a dedicated data-fetching/state layer.

Possible options:

```text
TanStack Query
Apollo Client
Zustand
```

This could centralize:

- Workflow queries.
- Run queries.
- Cache invalidation.
- Loading states.
- Error states.
- Optimistic updates.

---

## 39. Accessibility Improvements

### Future Improvement

Improve:

- Keyboard navigation.
- Focus management.
- Screen-reader labels.
- Color-independent status indicators.
- Modal accessibility.
- Accessible error messages.

---

## 40. UI/UX Improvements

### Future Improvement

Add:

- Workflow search.
- Workflow filtering.
- Better run timeline.
- Step execution duration.
- Expandable step input/output.
- Error details.
- Approval comments.
- Empty states.
- Loading skeletons.
- Toast notifications.

---

## 41. Security Hardening

### Future Improvement

Further harden production deployment with:

- Secret rotation.
- Strong webhook signatures.
- Rate limiting.
- CSP headers.
- Secure HTTP headers.
- CORS allowlists.
- Input validation.
- Request size limits.
- Dependency auditing.
- Security logging.

---

## 42. Deployment and Operations

### Future Improvement

Add CI/CD.

Example:

```text
GitHub
   ↓
Pull Request
   ↓
Lint
   ↓
Tests
   ↓
Build
   ↓
Deploy
```

Also add:

- Preview environments.
- Production environment protection.
- Environment-specific secrets.
- Deployment health checks.
- Rollback strategy.

---

## 43. Database Improvements

### Future Improvement

Add:

- More explicit foreign keys to Nhost users where appropriate.
- Additional indexes based on production query patterns.
- Retention policies for old step runs.
- Partitioning for large execution-history tables.
- Database migrations for every schema change.
- Automated backups and restore testing.

---

## 44. Workflow Cancellation

### Future Improvement

Implement a real cancellation operation:

```text
running
   ↓
cancelled
```

The engine should stop future steps and persist the cancellation reason.

---

## 45. Workflow Timeout

### Future Improvement

Allow a workflow or step to define a timeout.

Example:

```text
HTTP timeout = 30 seconds
Workflow timeout = 10 minutes
Approval timeout = 24 hours
```

Timeouts should transition execution to an explicit failed or cancelled state.

---

## 46. Long-Running Approval Handling

### Future Improvement

Support approvals that remain paused for days or weeks.

Add:

- Approval expiry.
- Reminders.
- Escalation.
- Delegation.
- Notification delivery.
- Approval SLA metrics.

---

## 47. Workflow Templates

### Future Improvement

Create reusable templates such as:

```text
Customer Approval
Lead Qualification
Invoice Approval
Support Ticket Routing
Content Review
```

Owners could instantiate a template instead of building a workflow from scratch.

---

## 48. Product-Level Billing

### Future Improvement

If FlowForge becomes a real SaaS product, add:

```text
Free
Pro
Team
Enterprise
```

with plan-specific:

- Workflow limits.
- Execution quotas.
- AI usage.
- Members.
- Retention.
- Integrations.

---

## 49. Internationalization

### Future Improvement

Support multiple languages for:

- Dashboard.
- Authentication.
- Workflow messages.
- Error messages.
- Notifications.

---

## 50. Final Future Direction

The assessment version establishes the foundation:

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

A future production version could evolve this into:

```text
Visual Builder
      ↓
Versioned Workflows
      ↓
Durable Job Queue
      ↓
Distributed Workers
      ↓
Multiple AI Providers
      ↓
Enterprise Integrations
      ↓
Audit + Observability
      ↓
Billing + Organizations
```

The current assessment implementation should remain focused and stable while these improvements are considered as separate product iterations.

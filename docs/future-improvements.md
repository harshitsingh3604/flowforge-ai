# FlowForge AI — Future Improvements

This document describes potential product and engineering improvements for FlowForge AI after the current assessment implementation.

The current project already demonstrates the core workflow-control-plane architecture:

```text
Authentication
      ↓
Multi-tenancy
      ↓
Role-based Authorization
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

The improvements below are intentionally separated from the assessment scope. They are future product/engineering work rather than requirements for the current submission.

---

## 1. Visual Workflow Builder

### Current State

The current dashboard provides workflow configuration and an assessment-oriented workflow experience. Workflow steps are persisted in `workflow_steps` and executed by the backend engine.

### Future Improvement

Build a visual drag-and-drop workflow editor.

Possible experience:

```text
                    Workflow Canvas

        ┌───────────────┐
        │   LLM Call    │
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │ HTTP Request  │
        └───────┬───────┘
                ↓
        ┌───────────────┐
        │   Condition   │
        └───────┬───────┘
             ┌──┴──┐
          TRUE    FALSE
            ↓        ↓
       ┌────────┐  ┌────────┐
       │Approval│  │ Next   │
       └───┬────┘  └───┬────┘
           └──────┬─────┘
                  ↓
             ┌────────┐
             │DB Write│
             └────────┘
```

Users could:

- Add steps.
- Delete steps.
- Reorder steps.
- Connect branches.
- Configure steps.
- Validate workflows.
- Preview execution paths.
- Publish workflows.

---

## 2. Rich Step Configuration UI

### Current State

Step configuration is stored in JSONB and interpreted by the execution engine.

### Future Improvement

Provide dedicated configuration forms for every step type.

### LLM

```text
Model
Prompt
Temperature
Maximum tokens
Structured output schema
```

### HTTP

```text
Method
URL
Headers
Query parameters
Body
Timeout
Authentication
```

### Conditional

```text
Source
Operator
Comparison value
True branch
False branch
```

### Approval

```text
Approvers
Approval policy
Deadline
Escalation
```

### DB Write

```text
Target
Data mapping
Write mode
```

### Notify

```text
Channel
Recipient
Message
Provider
```

This would allow workflows to be configured without requiring users to understand the underlying JSON configuration.

---

## 3. Workflow Versioning

### Current State

Workflow execution is based on the active workflow definition.

### Future Improvement

Introduce immutable workflow versions:

```text
Workflow
   ├── Version 1
   ├── Version 2
   └── Version 3
```

Each `workflow_run` should reference the exact version that was executed.

Benefits:

- Reproducible executions.
- Safe workflow updates.
- Rollback.
- Auditability.
- Easier debugging.
- Historical execution consistency.

---

## 4. Draft and Published Workflows

Add workflow lifecycle states:

```text
draft
published
archived
```

Only published workflows should be executable in production.

This separates:

```text
Workflow Editing
      ↓
Validation
      ↓
Publishing
      ↓
Execution
```

Owners could control publication while Editors continue to work on drafts according to their permissions.

---

## 5. Stronger Webhook Security

### Current State

FlowForge supports configured webhook secrets and validates webhook requests.

### Future Improvement

Move from shared secrets toward signed requests.

Add:

- HMAC signatures.
- Timestamp validation.
- Replay protection.
- Per-workflow credentials.
- Secret rotation.
- Webhook request rate limits.
- Signature versioning.

Example:

```text
Incoming Request
       ↓
Signature Validation
       ↓
Timestamp Validation
       ↓
Replay Check
       ↓
Trigger Validation
       ↓
Workflow Execution
```

---

## 6. Advanced Scheduling

### Current State

The project supports scheduled workflow triggers and contains a backend scheduler.

### Future Improvement

Expand scheduling capabilities with:

- Cron expressions.
- Time zones.
- Calendar-aware schedules.
- Pause/resume schedules.
- Next-run preview.
- Missed-run handling.
- Schedule history.
- Per-organization scheduling limits.
- Schedule concurrency policies.

Example:

```text
Every weekday at 09:00
          ↓
       Scheduler
          ↓
     Workflow Run
```

---

## 7. Advanced Database Event Triggers

### Current State

The project supports `database_event` triggers and a Hasura event integration path.

### Future Improvement

Expand event matching with:

- Multiple tables.
- Insert/update/delete filters.
- Row-level conditions.
- Payload mapping.
- Event batching.
- Event deduplication.
- Event replay.
- Event failure handling.

Example:

```text
Database Change
      ↓
Hasura Event Trigger
      ↓
Event Matching
      ↓
Workflow Input Mapping
      ↓
Workflow Run
```

---

## 8. Configurable Retry Policies

### Current State

LLM and HTTP execution paths have retry support.

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

The retry policy could be stored in the step's JSONB configuration.

---

## 9. Dead-Letter Handling

Introduce dead-letter handling for workflows or steps that repeatedly fail.

```text
Step Failure
    ↓
Retry
    ↓
Retry Exhausted
    ↓
Dead-Letter Record
    ↓
Manual Investigation
```

The dashboard could provide:

- Failed execution list.
- Failure reason.
- Retry count.
- Retry action.
- Failure history.
- Recovery status.

---

## 10. Production Observability

### Current State

Workflow and step errors are persisted and execution state is visible in the dashboard.

### Future Improvement

Add structured logging and distributed tracing.

Useful correlation fields:

```text
workflow_run_id
step_run_id
organization_id
user_id
trigger_type
duration
attempt
provider
error_code
```

A request should be traceable from:

```text
Trigger
  ↓
Action
  ↓
Workflow Run
  ↓
Step Run
  ↓
External Provider
```

---

## 11. Execution Metrics

Add operational metrics such as:

```text
Workflow success rate
Workflow failure rate
Average execution time
Step latency
LLM latency
HTTP latency
Retry rate
Approval wait time
Quota usage
Webhook volume
Scheduled execution volume
```

The dashboard could provide organization-level charts and execution summaries.

---

## 12. Audit Logs

Introduce a dedicated audit-log table.

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
trigger.created
trigger.updated
trigger.deleted
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

This would improve enterprise traceability and security investigations.

---

## 13. Advanced Approval Management

### Current State

The project supports a durable approval gate and approval/resume flow.

### Future Improvement

Support:

- Multiple approvers.
- Approval groups.
- Sequential approvals.
- Parallel approvals.
- Approval deadlines.
- Escalation.
- Delegation.
- Approval comments.
- Approval history.
- Approval policies.

Example:

```text
Approval Gate
      ↓
Manager Approval
      ↓
Finance Approval
      ↓
Continue
```

---

## 14. Approval Rejection

Add explicit rejection support.

```text
Approval Gate
     ↓
 ┌───┴────┐
Approve  Reject
   ↓        ↓
Continue  Rejected
```

A rejection should store:

```text
rejected_by
rejected_at
rejection_reason
```

Possible terminal states:

```text
rejected
cancelled
```

---

## 15. Richer Conditional Logic

### Current State

The assessment workflow demonstrates conditional branching based on workflow execution context.

### Future Improvement

Support operators such as:

```text
equals
not_equals
contains
not_contains
greater_than
less_than
greater_than_or_equal
less_than_or_equal
exists
regex
```

Support nested expressions:

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

The execution context carries outputs between workflow steps.

### Future Improvement

Introduce explicit expression syntax:

```text
{{steps.analyze_request.output}}
{{steps.http_request.output.id}}
{{workflow.input.customer.email}}
```

Add validation so references to missing steps or fields are detected before execution.

---

## 17. Workflow Input Schemas

Allow each workflow to define an input schema.

Example:

```json
{
  "customer": "string",
  "amount": "number",
  "priority": "string"
}
```

The system could validate inputs from:

- Manual execution.
- Webhooks.
- Scheduled triggers.
- Database events.

Invalid input should fail before consuming workflow execution resources.

---

## 18. Secure Credentials Management

### Current State

External integration configuration can be represented in step configuration.

### Future Improvement

Do not store sensitive credentials directly in workflow configuration.

Instead:

```text
workflow_steps.config
        ↓
credential_id
        ↓
Encrypted Credential Store
```

Credentials should:

- Be encrypted at rest.
- Never be returned to the frontend.
- Be scoped to an organization.
- Support rotation.
- Support revocation.
- Have audit history.

---

## 19. Integration Marketplace

Provide reusable integrations.

Potential integrations include:

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

Each integration could expose one or more workflow steps and use the secure credentials system.

---

## 20. Full Notification Providers

### Current State

The `notify` step creates notification events and the project has a Hasura Event Trigger integration point.

### Future Improvement

Add actual delivery providers:

```text
Email
Slack
Microsoft Teams
Discord
SMS
```

Track delivery state:

```text
pending
sending
delivered
failed
```

Store provider response information and retry failed notifications.

---

## 21. Dedicated Workflow Run History

Create a dedicated execution-history page.

Allow filtering by:

```text
Workflow
Status
User
Trigger
Date
```

A run detail page could show:

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
Timing
```

---

## 22. Workflow Replay

Allow users to replay a failed or completed workflow.

Possible options:

```text
Replay entire workflow
Replay from failed step
Replay from selected step
```

Replay must create a **new workflow run** rather than mutating historical execution data.

---

## 23. Concurrency Controls

Prevent unwanted duplicate or excessive executions.

Possible policies:

```text
Allow concurrent runs
Limit to one active run
Maximum concurrent runs = N
Queue additional runs
```

This is particularly useful for webhook-triggered workflows and scheduled workflows.

---

## 24. Rate Limiting

Add rate limiting to:

- Workflow triggers.
- Webhooks.
- Approval requests.
- Public API endpoints.
- Database-event endpoints.
- Notification-event endpoints.

Possible policies:

```text
Per user
Per organization
Per workflow
Per IP
```

Rate limits should return clear errors and avoid consuming workflow quota when a request is rejected before execution.

---

## 25. Durable Background Job Queue

### Current State

The workflow engine executes steps in the Node.js backend.

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
Persist step_run
   ↓
Queue next step
```

This would improve resilience for long-running and high-volume workflows.

---

## 26. Horizontal Worker Scaling

Run multiple workflow workers:

```text
                 Queue
              /    |    \
             /     |     \
        Worker 1 Worker 2 Worker 3
```

Workers should safely claim jobs and persist execution state.

This would allow workflow execution capacity to scale independently from the API server.

---

## 27. Distributed Locking

Add locking around workflow execution and approval resumes.

The goal is to prevent:

```text
Approve Request A
       +
Approve Request B
       ↓
Two concurrent resumes
```

Possible mechanisms:

- PostgreSQL row locks.
- Redis locks.
- Optimistic concurrency checks.
- Idempotency keys.

---

## 28. Idempotency

Add idempotency keys to workflow triggers and webhooks.

Example:

```text
Idempotency-Key: abc123
```

Behavior:

```text
Request 1 → workflow run created
Request 2 → existing run returned
```

This is especially important for external systems that retry webhook requests.

---

## 29. Better Organization Administration

Create an organization administration area for Owners.

Potential features:

- Invite member.
- Remove member.
- Change role.
- View organization members.
- View usage.
- Manage quota.
- View audit logs.
- View active workflows.
- Review execution history.

The existing Owner/Editor/Viewer authorization model should remain the enforcement boundary.

---

## 30. Advanced Quota Management

### Current State

The project has organization-level execution quota tracking.

### Future Improvement

Support:

- Different quotas per plan.
- Automated monthly resets.
- Usage alerts.
- Soft limits.
- Hard limits.
- Per-step usage accounting.
- AI token usage.
- Provider-specific cost accounting.
- Organization usage dashboards.

Example:

```text
Organization
     ↓
Plan
     ↓
Execution Quota
     ↓
AI Usage
     ↓
Usage Alerts
```

---

## 31. AI Provider Abstraction

### Current State

The LLM step uses Google Gemini.

### Future Improvement

Introduce an abstraction layer:

```text
LLM Provider
    ├── Gemini
    ├── OpenAI
    ├── Anthropic
    └── Groq
```

Workflow configuration could choose the provider without changing the workflow engine.

---

## 32. AI Cost Tracking

Record LLM usage for every LLM step run:

```text
model
input_tokens
output_tokens
total_tokens
estimated_cost
latency
```

This could support organization-level AI usage reporting and future billing.

---

## 33. Better LLM Reliability

Add:

- Structured JSON output.
- Schema validation.
- Prompt versioning.
- Model fallback.
- Provider fallback.
- Timeout handling.
- Token limits.
- Output validation.
- Provider-specific retry policies.

Example:

```text
Gemini Failure
      ↓
Fallback Provider
      ↓
Retry
      ↓
Success / Failure
```

---

## 34. Automated Testing

### Current State

The project has the core implementation and manual integration flow.

### Future Improvement

Add automated tests at three levels.

### Unit Tests

Test:

- Authorization.
- Quota.
- Retry.
- Conditional branching.
- Step dispatch.
- Approval validation.
- Input validation.
- Webhook validation.

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
Create Workflow
  ↓
Run
  ↓
Pause
  ↓
Approve
  ↓
Completed
```

---

## 35. TypeScript Migration

### Current State

The project is implemented using JavaScript and JSX.

### Future Improvement

Migrate the client and server to TypeScript.

Useful types include:

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
ActionPayload
```

This would improve:

- IDE support.
- Refactoring safety.
- API contracts.
- Configuration validation.
- Developer experience.

---

## 36. API Documentation

Document backend endpoints and Hasura Actions with OpenAPI or equivalent documentation.

Document:

```text
POST /actions/trigger-workflow-run
POST /actions/approve-step
POST /actions/trigger-workflow-webhook
POST /webhooks/workflow/:workflowId
POST /events/notification
POST /events/database
```

Each endpoint should document:

- Request schema.
- Response schema.
- Authentication.
- Authorization.
- Required headers.
- Error codes.
- Examples.
- Rate limits.

---

## 37. Centralized Error Catalog

### Current State

The backend already uses explicit error codes in important paths.

### Future Improvement

Create one centralized error catalog.

Example:

```text
AUTH_REQUIRED
FORBIDDEN
ORGANIZATION_NOT_FOUND
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
INVALID_EVENT_SECRET
RATE_LIMITED
```

The same catalog should be used by:

```text
Backend
Hasura Actions
Frontend
Logs
API Documentation
```

This would make frontend error handling more predictable.

---

## 38. Better Frontend State Management

As the product grows, centralize data fetching and UI state.

Possible approaches include:

```text
TanStack Query
Apollo Client
Zustand
```

Potential responsibilities:

- Workflow queries.
- Run queries.
- Cache invalidation.
- Loading states.
- Error states.
- Optimistic updates.
- Subscription synchronization.

---

## 39. Accessibility Improvements

Improve:

- Keyboard navigation.
- Focus management.
- Screen-reader labels.
- Color-independent status indicators.
- Modal accessibility.
- Form validation messages.
- Accessible error messages.
- Reduced-motion support.

All workflow states should remain understandable without relying only on color.

---

## 40. UI/UX Improvements

Potential dashboard improvements:

- Workflow search.
- Workflow filtering.
- Better execution timeline.
- Step execution duration.
- Expandable step input/output.
- Detailed errors.
- Approval comments.
- Empty states.
- Loading skeletons.
- Toast notifications.
- Better mobile responsiveness.
- Execution status filters.
- Faster navigation between workflow runs.

---

## 41. Security Hardening

Further production hardening should include:

- Secret rotation.
- HMAC webhook signatures.
- Rate limiting.
- Content Security Policy.
- Secure HTTP headers.
- Strict CORS allowlists.
- Input validation.
- Request-size limits.
- Dependency auditing.
- Security logging.
- Secret scanning in CI.
- Security-focused integration tests.

The frontend should never become the authorization boundary; sensitive authorization must remain enforced by Hasura and the backend.

---

## 42. Deployment and Operations

Introduce a complete CI/CD pipeline:

```text
GitHub
   ↓
Pull Request
   ↓
Lint
   ↓
Unit Tests
   ↓
Integration Tests
   ↓
Build
   ↓
Deploy
   ↓
Health Check
```

Additional improvements:

- Preview environments.
- Production environment protection.
- Environment-specific secrets.
- Deployment health checks.
- Rollback strategy.
- Migration verification.
- Smoke tests after deployment.
- Deployment notifications.

---

## 43. Database Improvements

Potential database improvements include:

- More explicit foreign keys to Nhost users where appropriate.
- Additional indexes based on production query patterns.
- Retention policies for old `step_runs`.
- Retention policies for workflow history.
- Partitioning large execution-history tables.
- A migration for every schema change.
- Automated backups.
- Restore testing.
- Query-performance monitoring.
- Data archival.

The database schema should remain backward-compatible with workflow execution and historical run inspection.

---

## 44. Workflow Cancellation

Implement a real cancellation operation:

```text
running
   ↓
cancelled
```

Cancellation should:

1. Verify authorization.
2. Verify the workflow run can be cancelled.
3. Prevent future steps from executing.
4. Persist cancellation state.
5. Store the cancellation reason.
6. Update active step state if necessary.

---

## 45. Workflow and Step Timeouts

Allow workflows and individual steps to define timeouts.

Example:

```text
HTTP timeout     = 30 seconds
Workflow timeout = 10 minutes
Approval timeout = 24 hours
```

Timeouts should produce explicit states:

```text
failed
cancelled
expired
```

rather than leaving a workflow permanently active.

---

## 46. Long-Running Approval Handling

Support approval gates that remain paused for days or weeks.

Potential capabilities:

- Approval expiry.
- Reminders.
- Escalation.
- Delegation.
- Notification delivery.
- Approval SLA metrics.
- Approval reassignment.
- Approval history.

Example:

```text
Paused
  ↓
Reminder
  ↓
Escalation
  ↓
Approval / Rejection / Expiry
```

---

## 47. Workflow Templates

Create reusable workflow templates such as:

```text
Customer Approval
Lead Qualification
Invoice Approval
Support Ticket Routing
Content Review
```

Owners could instantiate templates instead of creating every workflow from scratch.

Templates could define:

```text
Steps
Triggers
Default configuration
Required credentials
Required permissions
```

---

## 48. Product-Level Billing

If FlowForge evolves into a SaaS product, add plans such as:

```text
Free
Pro
Team
Enterprise
```

Plan-specific limits could include:

- Workflow count.
- Execution quota.
- AI usage.
- Organization members.
- Execution retention.
- Integrations.
- Scheduling limits.
- Webhook volume.

Billing should remain separate from the core workflow execution engine.

---

## 49. Internationalization

Support multiple languages for:

- Dashboard.
- Authentication.
- Workflow messages.
- Error messages.
- Notifications.
- Organization administration.

The backend error catalog should use stable error codes so localized frontend messages can be provided without changing backend behavior.

---

## 50. Final Product Direction

The current assessment implementation establishes the foundation:

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

A future production-oriented FlowForge could evolve toward:

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

The current assessment implementation should remain focused and stable while these improvements are developed as separate product iterations.

---

## Suggested Development Priority

If these improvements are implemented incrementally, a practical order would be:

### Phase 1 — Reliability

```text
Automated Tests
      ↓
Idempotency
      ↓
Concurrency Controls
      ↓
Timeouts
      ↓
Cancellation
      ↓
Centralized Errors
```

### Phase 2 — Security

```text
Credential Management
      ↓
HMAC Webhooks
      ↓
Rate Limiting
      ↓
Secret Rotation
      ↓
Security Logging
```

### Phase 3 — Workflow Product Experience

```text
Visual Builder
      ↓
Step Configuration UI
      ↓
Input Schemas
      ↓
Data Mapping
      ↓
Workflow Versioning
      ↓
Draft / Publish
```

### Phase 4 — Scale

```text
Durable Job Queue
      ↓
Distributed Workers
      ↓
Distributed Locks
      ↓
Execution Metrics
      ↓
Production Observability
```

### Phase 5 — SaaS Expansion

```text
Integrations
      ↓
Templates
      ↓
Organization Administration
      ↓
AI Cost Tracking
      ↓
Billing
      ↓
Enterprise Features
```



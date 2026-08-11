# FlowForge AI — Hasura Metadata

This directory contains the Hasura metadata export supplied for the current FlowForge AI project.

## Included

- `metadata.json` — complete Hasura metadata export.
- Tracked application tables:
  - `organizations`
  - `org_members`
  - `workflows`
  - `workflow_steps`
  - `workflow_triggers`
  - `workflow_runs`
  - `step_runs`
  - `workflow_results`
  - `notification_events`
- Actions:
  - `triggerWorkflowRun(workflow_id)`
  - `approveStep(step_run_id)`
- Event Trigger:
  - `notification_events` → notification event webhook

## Important before submission

The supplied metadata currently contains the development ngrok handler URL for the Actions and notification Event Trigger. Replace that development URL with the final deployed backend HTTPS URL before importing/deploying this metadata for the assessment.

The backend handlers expected by the current project are:

- `/actions/trigger-workflow-run`
- `/actions/approve-step`
- `/events/notification`

Do not put `HASURA_ADMIN_SECRET` or any other secret into this metadata file.

## Relationship/security scope

The metadata preserves the current Nhost/Hasura configuration from the supplied export, including organization-scoped permissions and Owner/Editor/Viewer workflow permissions.

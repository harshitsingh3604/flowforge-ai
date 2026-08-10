# Managed Hasura metadata

The Nhost Cloud project is the live source of truth for Hasura metadata. The project was configured manually in the Nhost/Hasura console during development. This directory documents the security contract so it can be reproduced/exported before submission.

Required tracked tables: organizations, org_members, workflows, workflow_steps, workflow_triggers, workflow_runs, step_runs, workflow_results, notification_events.

Required relationships: organization → members/workflows; workflow → organization/steps/triggers/runs; workflow_run → workflow/step_runs; step_run → workflow_run/workflow_step.

Required Actions: `triggerWorkflowRun(workflow_id)` and `approveStep(step_run_id)`.

Required Event Trigger: `notification_events` → `POST /events/notification`.

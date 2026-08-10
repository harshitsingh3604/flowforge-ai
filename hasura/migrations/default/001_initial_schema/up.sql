-- ============================================================
-- FlowForge AI
-- Initial PostgreSQL Schema
-- Day 1
-- ============================================================

-- ------------------------------------------------------------
-- Extensions
-- ------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    quota_limit INTEGER NOT NULL DEFAULT 100,
    quota_used INTEGER NOT NULL DEFAULT 0,

    quota_period_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc(
        'month',
        NOW()
    ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT organizations_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT organizations_quota_limit_positive
        CHECK (quota_limit >= 0),

    CONSTRAINT organizations_quota_used_non_negative
        CHECK (quota_used >= 0)
);


-- ============================================================
-- 2. ORGANIZATION MEMBERS
-- ============================================================

CREATE TABLE public.org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,

    role TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT org_members_role_check
        CHECK (
            role IN (
                'owner',
                'editor',
                'viewer'
            )
        ),

    CONSTRAINT org_members_unique_user_per_org
        UNIQUE (
            organization_id,
            user_id
        ),

    CONSTRAINT org_members_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES public.organizations(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 3. WORKFLOWS
-- ============================================================

CREATE TABLE public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL,

    name TEXT NOT NULL,
    description TEXT,

    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workflows_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT workflows_organization_fk
        FOREIGN KEY (organization_id)
        REFERENCES public.organizations(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 4. WORKFLOW STEPS
-- ============================================================

CREATE TABLE public.workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL,

    position INTEGER NOT NULL,

    name TEXT NOT NULL,

    type TEXT NOT NULL,

    config JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workflow_steps_position_positive
        CHECK (position > 0),

    CONSTRAINT workflow_steps_type_check
        CHECK (
            type IN (
                'llm_call',
                'http_request',
                'db_write',
                'notify',
                'conditional_branch',
                'approval_gate'
            )
        ),

    CONSTRAINT workflow_steps_name_not_empty
        CHECK (length(trim(name)) > 0),

    CONSTRAINT workflow_steps_unique_position
        UNIQUE (
            workflow_id,
            position
        ),

    CONSTRAINT workflow_steps_workflow_fk
        FOREIGN KEY (workflow_id)
        REFERENCES public.workflows(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 5. WORKFLOW TRIGGERS
-- ============================================================

CREATE TABLE public.workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL,

    type TEXT NOT NULL,

    config JSONB NOT NULL DEFAULT '{}'::jsonb,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workflow_triggers_type_check
        CHECK (
            type IN (
                'manual',
                'webhook',
                'scheduled',
                'database_event'
            )
        ),

    CONSTRAINT workflow_triggers_workflow_fk
        FOREIGN KEY (workflow_id)
        REFERENCES public.workflows(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 6. WORKFLOW RUNS
-- ============================================================

CREATE TABLE public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL,

    trigger_type TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued',

    created_by UUID,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workflow_runs_trigger_type_check
        CHECK (
            trigger_type IN (
                'manual',
                'webhook',
                'scheduled',
                'database_event',
                'approval_resume'
            )
        ),

    CONSTRAINT workflow_runs_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'paused',
                'completed',
                'failed',
                'cancelled'
            )
        ),

    CONSTRAINT workflow_runs_workflow_fk
        FOREIGN KEY (workflow_id)
        REFERENCES public.workflows(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 7. STEP RUNS
-- ============================================================

CREATE TABLE public.step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_run_id UUID NOT NULL,

    workflow_step_id UUID NOT NULL,

    status TEXT NOT NULL DEFAULT 'queued',

    input JSONB,
    output JSONB,

    error TEXT,

    attempt_count INTEGER NOT NULL DEFAULT 0,

    approved_by UUID,
    approved_at TIMESTAMPTZ,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT step_runs_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'paused',
                'completed',
                'failed',
                'cancelled'
            )
        ),

    CONSTRAINT step_runs_attempt_count_check
        CHECK (attempt_count >= 0),

    CONSTRAINT step_runs_workflow_run_fk
        FOREIGN KEY (workflow_run_id)
        REFERENCES public.workflow_runs(id)
        ON DELETE CASCADE,

    CONSTRAINT step_runs_workflow_step_fk
        FOREIGN KEY (workflow_step_id)
        REFERENCES public.workflow_steps(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 8. WORKFLOW RESULTS
-- ============================================================

CREATE TABLE public.workflow_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL,

    workflow_run_id UUID NOT NULL,

    step_run_id UUID,

    data JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workflow_results_workflow_fk
        FOREIGN KEY (workflow_id)
        REFERENCES public.workflows(id)
        ON DELETE CASCADE,

    CONSTRAINT workflow_results_workflow_run_fk
        FOREIGN KEY (workflow_run_id)
        REFERENCES public.workflow_runs(id)
        ON DELETE CASCADE,

    CONSTRAINT workflow_results_step_run_fk
        FOREIGN KEY (step_run_id)
        REFERENCES public.step_runs(id)
        ON DELETE SET NULL
);


-- ============================================================
-- 9. NOTIFICATION EVENTS
-- ============================================================

CREATE TABLE public.notification_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL,

    workflow_run_id UUID,

    step_run_id UUID,

    channel TEXT NOT NULL,

    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    status TEXT NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    error TEXT,

    CONSTRAINT notification_events_channel_check
        CHECK (
            channel IN (
                'slack',
                'email'
            )
        ),

    CONSTRAINT notification_events_status_check
        CHECK (
            status IN (
                'pending',
                'processed',
                'failed'
            )
        ),

    CONSTRAINT notification_events_workflow_fk
        FOREIGN KEY (workflow_id)
        REFERENCES public.workflows(id)
        ON DELETE CASCADE,

    CONSTRAINT notification_events_workflow_run_fk
        FOREIGN KEY (workflow_run_id)
        REFERENCES public.workflow_runs(id)
        ON DELETE CASCADE,

    CONSTRAINT notification_events_step_run_fk
        FOREIGN KEY (step_run_id)
        REFERENCES public.step_runs(id)
        ON DELETE CASCADE
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_org_members_organization_id
    ON public.org_members(organization_id);

CREATE INDEX idx_org_members_user_id
    ON public.org_members(user_id);

CREATE INDEX idx_workflows_organization_id
    ON public.workflows(organization_id);

CREATE INDEX idx_workflow_steps_workflow_id
    ON public.workflow_steps(workflow_id);

CREATE INDEX idx_workflow_triggers_workflow_id
    ON public.workflow_triggers(workflow_id);

CREATE INDEX idx_workflow_triggers_enabled
    ON public.workflow_triggers(enabled);

CREATE INDEX idx_workflow_runs_workflow_id
    ON public.workflow_runs(workflow_id);

CREATE INDEX idx_workflow_runs_status
    ON public.workflow_runs(status);

CREATE INDEX idx_workflow_runs_created_at
    ON public.workflow_runs(created_at DESC);

CREATE INDEX idx_step_runs_workflow_run_id
    ON public.step_runs(workflow_run_id);

CREATE INDEX idx_step_runs_workflow_step_id
    ON public.step_runs(workflow_step_id);

CREATE INDEX idx_step_runs_status
    ON public.step_runs(status);

CREATE INDEX idx_notification_events_status
    ON public.notification_events(status);

CREATE INDEX idx_notification_events_created_at
    ON public.notification_events(created_at DESC);

CREATE INDEX idx_workflow_results_workflow_run_id
    ON public.workflow_results(workflow_run_id);


-- ============================================================
-- MONTHLY USAGE VIEW
-- Required aggregation for the assignment
-- ============================================================

CREATE OR REPLACE VIEW public.organization_usage_this_month AS
SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    o.quota_limit,
    o.quota_used,
    o.quota_period_start,

    COUNT(
        CASE
            WHEN wr.status = 'completed'
            THEN 1
        END
    ) AS completed_runs_this_month

FROM public.organizations o

LEFT JOIN public.workflows w
    ON w.organization_id = o.id

LEFT JOIN public.workflow_runs wr
    ON wr.workflow_id = w.id
    AND wr.created_at >= date_trunc(
        'month',
        NOW()
    )

GROUP BY
    o.id,
    o.name,
    o.quota_limit,
    o.quota_used,
    o.quota_period_start;
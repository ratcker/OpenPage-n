BEGIN;

CREATE TABLE builds (
    id UUID PRIMARY KEY,
    source_event_id UUID NOT NULL UNIQUE REFERENCES source_events (id),
    project_id UUID NOT NULL REFERENCES projects (id),
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'superseded')),
    config_snapshot JSONB NOT NULL CHECK (jsonb_typeof(config_snapshot) = 'object'),
    config_revision BIGINT NOT NULL CHECK (config_revision > 0),
    pipeline_run TEXT,
    image_digests JSONB CHECK (jsonb_typeof(image_digests) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((status = 'succeeded') = (image_digests IS NOT NULL))
);

CREATE UNIQUE INDEX builds_single_running ON builds ((true)) WHERE status = 'running';
CREATE INDEX builds_pending_order ON builds (created_at, id) WHERE status = 'pending';

CREATE FUNCTION reject_build_snapshot_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'build configuration snapshot is immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER builds_immutable_snapshot
    BEFORE UPDATE OF config_snapshot, config_revision ON builds
    FOR EACH ROW WHEN (
        OLD.config_snapshot IS DISTINCT FROM NEW.config_snapshot
        OR OLD.config_revision IS DISTINCT FROM NEW.config_revision
    )
    EXECUTE FUNCTION reject_build_snapshot_change();

COMMIT;

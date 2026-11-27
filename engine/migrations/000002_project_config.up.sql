BEGIN;

ALTER TABLE projects
    ADD COLUMN config JSONB,
    ADD COLUMN config_revision BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT projects_config_revision_check CHECK (
        (config IS NULL AND config_revision = 0)
        OR (config IS NOT NULL AND jsonb_typeof(config) = 'object' AND config_revision > 0)
    );

COMMIT;

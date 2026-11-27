BEGIN;

ALTER TABLE projects
    DROP CONSTRAINT projects_config_revision_check,
    DROP COLUMN config_revision,
    DROP COLUMN config;

COMMIT;

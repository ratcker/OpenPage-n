BEGIN;

DROP TABLE builds;
DROP FUNCTION reject_build_snapshot_change();

COMMIT;

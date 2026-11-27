package engineapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"reflect"
)

var (
	errConflict = errors.New("conflict")
	errNotFound = errors.New("project not found")
)

type project struct {
	ID               string  `json:"id"`
	RepoURL          string  `json:"repo_url"`
	ObservedSHA      *string `json:"observed_sha"`
	ObservedRevision int64   `json:"observed_revision"`
	Enabled          bool    `json:"-"`
}

type configuredProject struct {
	project
	Config         json.RawMessage `json:"config"`
	ConfigRevision int64           `json:"config_revision"`
}

type observation struct {
	PreviousSHA      *string `json:"previous_sha"`
	PreviousRevision *int64  `json:"previous_revision"`
	SHA              string  `json:"sha"`
}

const projectColumns = "id, repo_url, observed_sha, observed_revision, enabled"
const configuredColumns = projectColumns + ", config, config_revision"

func registerProject(ctx context.Context, db *sql.DB, id, repoURL string, enabled bool, config *projectConfig) (configuredProject, bool, error) {
	data, err := json.Marshal(config)
	if err != nil {
		return configuredProject{}, false, err
	}
	p, err := readConfiguredProject(db.QueryRowContext(ctx, `
		INSERT INTO projects (id, repo_url, enabled, config, config_revision)
		VALUES ($1, $2, $3, $4::jsonb, 1) ON CONFLICT (id) DO NOTHING
		RETURNING `+configuredColumns, id, repoURL, enabled, string(data)))
	if !errors.Is(err, sql.ErrNoRows) {
		return p, err == nil, err
	}

	// После конкурентной вставки новый SQL-запрос увидит зафиксированную строку.
	p, err = readConfiguredProject(db.QueryRowContext(ctx, "SELECT "+configuredColumns+`
		FROM projects WHERE id = $1 AND repo_url = $2 AND enabled = $3 AND config = $4::jsonb`,
		id, repoURL, enabled, string(data)))
	if errors.Is(err, sql.ErrNoRows) {
		err = errConflict
	}
	return p, false, err
}

func readConfiguredProject(row *sql.Row) (configuredProject, error) {
	var p configuredProject
	var config []byte
	err := row.Scan(&p.ID, &p.RepoURL, &p.ObservedSHA, &p.ObservedRevision, &p.Enabled, &config, &p.ConfigRevision)
	p.Config = config
	return p, err
}

func updateProjectConfig(ctx context.Context, db *sql.DB, id string, previousRevision int64, config *projectConfig) (configuredProject, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return configuredProject{}, err
	}
	defer tx.Rollback()

	p, err := readConfiguredProject(tx.QueryRowContext(ctx, "SELECT "+configuredColumns+" FROM projects WHERE id = $1 FOR UPDATE", id))
	if errors.Is(err, sql.ErrNoRows) {
		return p, errNotFound
	}
	if err != nil {
		return p, err
	}
	if previousRevision != p.ConfigRevision {
		return p, errConflict
	}
	if p.Config != nil {
		var current projectConfig
		if err := json.Unmarshal(p.Config, &current); err != nil {
			return p, err
		}
		if current.Hostname != config.Hostname {
			return p, errConflict
		}
		if reflect.DeepEqual(current, *config) {
			return p, tx.Commit()
		}
	}

	data, err := json.Marshal(config)
	if err != nil {
		return p, err
	}
	p, err = readConfiguredProject(tx.QueryRowContext(ctx, `
		UPDATE projects SET config = $2::jsonb, config_revision = config_revision + 1, updated_at = now()
		WHERE id = $1 RETURNING `+configuredColumns, id, string(data)))
	if err != nil {
		return p, err
	}
	return p, tx.Commit()
}

func readProject(row *sql.Row) (project, error) {
	var p project
	err := row.Scan(&p.ID, &p.RepoURL, &p.ObservedSHA, &p.ObservedRevision, &p.Enabled)
	return p, err
}

func watcherProjects(ctx context.Context, db *sql.DB) ([]project, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT id, repo_url, observed_sha, observed_revision FROM projects WHERE enabled ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []project{}
	for rows.Next() {
		var p project
		if err := rows.Scan(&p.ID, &p.RepoURL, &p.ObservedSHA, &p.ObservedRevision); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func recordObservation(ctx context.Context, db *sql.DB, id string, input observation) (project, error) {
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return project{}, err
	}
	defer tx.Rollback()

	p, err := readProject(tx.QueryRowContext(ctx, "SELECT "+projectColumns+" FROM projects WHERE id = $1 FOR UPDATE", id))
	if errors.Is(err, sql.ErrNoRows) {
		return p, errNotFound
	}
	if err != nil {
		return p, err
	}
	if !p.Enabled {
		return p, errConflict
	}

	previousRevision := *input.PreviousRevision
	sameHead := p.ObservedSHA != nil && *p.ObservedSHA == input.SHA
	switch {
	case previousRevision == p.ObservedRevision && sameSHA(input.PreviousSHA, p.ObservedSHA):
		if sameHead {
			return p, tx.Commit()
		}
	case previousRevision == p.ObservedRevision-1 && sameHead:
		// Повтор допустим только для перехода, который создал текущую ревизию.
		var replay bool
		err := tx.QueryRowContext(ctx, `
			SELECT EXISTS (
			    SELECT 1 FROM source_events
			    WHERE project_id = $1 AND observed_revision = $2 AND sha = $3
			          AND previous_sha IS NOT DISTINCT FROM $4::text
			)`, id, p.ObservedRevision, input.SHA, input.PreviousSHA).Scan(&replay)
		if err != nil {
			return p, err
		}
		if replay {
			return p, tx.Commit()
		}
		return p, errConflict
	default:
		return p, errConflict
	}

	var eventID string
	err = tx.QueryRowContext(ctx, `
		WITH updated AS (
		    UPDATE projects
		    SET observed_sha = $2, observed_revision = observed_revision + 1, updated_at = now()
		    WHERE id = $1 RETURNING id, observed_revision
		)
		INSERT INTO source_events (id, project_id, previous_sha, sha, observed_revision)
		SELECT gen_random_uuid(), id, $3, $2, observed_revision FROM updated
		RETURNING id, observed_revision`, id, input.SHA, input.PreviousSHA).Scan(&eventID, &p.ObservedRevision)
	if err != nil {
		return p, err
	}
	if err := supersedePending(ctx, tx, id); err != nil {
		return p, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO builds (id, source_event_id, project_id, status, config_snapshot, config_revision)
		SELECT gen_random_uuid(), $2, id, 'pending', config, config_revision
		FROM projects WHERE id = $1 AND config IS NOT NULL`, id, eventID); err != nil {
		return p, err
	}
	p.ObservedSHA = &input.SHA
	return p, tx.Commit()
}

func supersedePending(ctx context.Context, tx *sql.Tx, projectID string) error {
	_, err := tx.ExecContext(ctx, `
		UPDATE builds SET status = 'superseded', updated_at = now()
		WHERE project_id = $1 AND status = 'pending'`, projectID)
	return err
}

func sameSHA(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

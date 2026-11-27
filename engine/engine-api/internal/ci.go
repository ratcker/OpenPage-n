package engineapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"regexp"

	"github.com/lib/pq"
)

var (
	errBuildNotFound = errors.New("build not found")
	errBuildConflict = errors.New("build state or pipeline_run conflicts")
	errImageDigests  = errors.New("image_digests must contain an immutable image reference for each service in the snapshot")
	imageRefPattern  = regexp.MustCompile(`^((([a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+|localhost)(:[0-9]+)?|[a-zA-Z0-9-]+:[0-9]+|\[[0-9a-fA-F:]+\](:[0-9]+)?)(/[a-z0-9]+(([._]|__|-+)[a-z0-9]+)*)+(:[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127})?@(sha256:[0-9a-f]{64}|sha384:[0-9a-f]{96}|sha512:[0-9a-f]{128})$`)
)

type claimedBuild struct {
	ID             string          `json:"id"`
	SourceEventID  string          `json:"source_event_id"`
	ProjectID      string          `json:"project_id"`
	RepoURL        string          `json:"repo_url"`
	SHA            string          `json:"sha"`
	Status         string          `json:"status"`
	ConfigRevision int64           `json:"config_revision"`
	ConfigSnapshot json.RawMessage `json:"config_snapshot"`
}

type buildState struct {
	ID           string            `json:"id"`
	Status       string            `json:"status"`
	PipelineRun  *string           `json:"pipeline_run"`
	ImageDigests map[string]string `json:"image_digests"`
}

type buildPatch struct {
	PipelineRun  *string           `json:"pipeline_run"`
	Status       *string           `json:"status"`
	ImageDigests map[string]string `json:"image_digests"`
}

func (a api) claim(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	build, err := claimBuild(ctx, a.db)
	if errors.Is(err, sql.ErrNoRows) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeResult(w, http.StatusOK, build, err)
}

func (a api) patchBuild(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusBadRequest, "id must be a UUID")
		return
	}
	var input buildPatch
	if !readJSON(w, r, &input) {
		return
	}
	if input.PipelineRun == nil && input.Status == nil {
		writeError(w, http.StatusBadRequest, "pipeline_run or status is required")
		return
	}
	if input.PipelineRun != nil && (len(*input.PipelineRun) > 253 || !lowerDNSName.MatchString(*input.PipelineRun)) {
		writeError(w, http.StatusBadRequest, "pipeline_run must be a Kubernetes DNS name")
		return
	}
	if input.Status != nil && *input.Status != "succeeded" && *input.Status != "failed" {
		writeError(w, http.StatusBadRequest, "status must be succeeded or failed")
		return
	}
	if input.Status != nil && *input.Status == "succeeded" {
		if len(input.ImageDigests) == 0 {
			writeError(w, http.StatusBadRequest, errImageDigests.Error())
			return
		}
		for _, image := range input.ImageDigests {
			if !imageRefPattern.MatchString(image) {
				writeError(w, http.StatusBadRequest, errImageDigests.Error())
				return
			}
		}
	} else if input.ImageDigests != nil {
		writeError(w, http.StatusBadRequest, "image_digests is only accepted with succeeded status")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	build, err := updateBuild(ctx, a.db, id, input)
	writeResult(w, http.StatusOK, build, err)
}

func claimBuild(ctx context.Context, db *sql.DB) (claimedBuild, error) {
	var build claimedBuild
	// Блокируем проект раньше сборки, как при наблюдении HEAD.
	err := db.QueryRowContext(ctx, `
		WITH candidate AS (
		    SELECT b.id, p.repo_url, e.sha
		    FROM builds b JOIN projects p ON p.id = b.project_id
		    JOIN source_events e ON e.id = b.source_event_id AND e.project_id = p.id
		    WHERE b.status = 'pending' AND p.enabled
		          AND e.observed_revision = p.observed_revision AND e.sha = p.observed_sha
		          AND NOT EXISTS (SELECT 1 FROM builds WHERE status = 'running')
		    ORDER BY b.created_at, b.id
		    LIMIT 1 FOR UPDATE OF p SKIP LOCKED
		)
		UPDATE builds b SET status = 'running', updated_at = now()
		FROM candidate c WHERE b.id = c.id AND b.status = 'pending'
		RETURNING b.id, b.source_event_id, b.project_id, c.repo_url, c.sha,
		          b.status, b.config_revision, b.config_snapshot`).Scan(
		&build.ID, &build.SourceEventID, &build.ProjectID, &build.RepoURL, &build.SHA,
		&build.Status, &build.ConfigRevision, &build.ConfigSnapshot)
	var pgErr *pq.Error
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.Constraint == "builds_single_running" {
		// Другой запрос успел занять единственное место running.
		return build, sql.ErrNoRows
	}
	return build, err
}

func updateBuild(ctx context.Context, db *sql.DB, id string, input buildPatch) (buildState, error) {
	var build buildState
	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return build, err
	}
	defer tx.Rollback()

	var snapshot, digests []byte
	err = tx.QueryRowContext(ctx, `
		SELECT id, status, pipeline_run, config_snapshot, image_digests
		FROM builds WHERE id = $1 FOR UPDATE`, id).Scan(
		&build.ID, &build.Status, &build.PipelineRun, &snapshot, &digests)
	if errors.Is(err, sql.ErrNoRows) {
		return build, errBuildNotFound
	}
	if err != nil {
		return build, err
	}
	if digests != nil {
		if err := json.Unmarshal(digests, &build.ImageDigests); err != nil {
			return build, err
		}
	}
	if input.ImageDigests != nil {
		var config projectConfig
		if err := json.Unmarshal(snapshot, &config); err != nil {
			return build, err
		}
		if len(input.ImageDigests) != len(config.Services) {
			return build, errImageDigests
		}
		for name := range config.Services {
			if _, exists := input.ImageDigests[name]; !exists {
				return build, errImageDigests
			}
		}
	}

	sameRun := input.PipelineRun == nil || (build.PipelineRun != nil && *input.PipelineRun == *build.PipelineRun)
	if build.Status != "running" {
		if (build.Status == "succeeded" || build.Status == "failed") && sameRun &&
			(input.Status == nil || (*input.Status == build.Status && maps.Equal(input.ImageDigests, build.ImageDigests))) {
			return build, tx.Commit()
		}
		return build, errBuildConflict
	}
	if build.PipelineRun != nil && !sameRun {
		return build, errBuildConflict
	}
	if sameRun && input.Status == nil {
		return build, tx.Commit()
	}

	if input.PipelineRun != nil {
		build.PipelineRun = input.PipelineRun
	}
	var data any
	if input.Status != nil {
		build.Status = *input.Status
		build.ImageDigests = input.ImageDigests
		if input.ImageDigests != nil {
			encoded, err := json.Marshal(input.ImageDigests)
			if err != nil {
				return build, err
			}
			data = string(encoded)
		}
	}
	if _, err := tx.ExecContext(ctx, `
		UPDATE builds SET status = $2, pipeline_run = $3, image_digests = $4::jsonb, updated_at = now()
		WHERE id = $1`, id, build.Status, build.PipelineRun, data); err != nil {
		return build, err
	}
	return build, tx.Commit()
}

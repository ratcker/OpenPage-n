package engineapi

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const dbTimeout = 5 * time.Second

var (
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	shaPattern  = regexp.MustCompile(`^([0-9a-f]{40}|[0-9a-f]{64})$`)
)

type api struct {
	db *sql.DB
}

// NewHandler регистрирует маршруты API и, при включении, документацию.
func NewHandler(db *sql.DB, platformToken, watcherToken, ciToken string, docsEnabled bool) http.Handler {
	a := api{db: db}
	mux := http.NewServeMux()
	mux.Handle("POST /internal/v1/projects", serviceAuth(platformToken, a.createProject))
	mux.Handle("PUT /internal/v1/projects/{id}/config", serviceAuth(platformToken, a.configureProject))
	mux.Handle("GET /internal/v1/watcher/projects", serviceAuth(watcherToken, a.listProjects))
	mux.Handle("POST /internal/v1/watcher/projects/{id}/observations", serviceAuth(watcherToken, a.observe))
	mux.Handle("POST /internal/v1/ci/builds/claim", serviceAuth(ciToken, a.claim))
	mux.Handle("PATCH /internal/v1/ci/builds/{id}", serviceAuth(ciToken, a.patchBuild))
	if docsEnabled {
		registerDocs(mux)
	}
	return mux
}

func (a api) createProject(w http.ResponseWriter, r *http.Request) {
	var input struct {
		ID      string         `json:"id"`
		RepoURL string         `json:"repo_url"`
		Enabled *bool          `json:"enabled"`
		Config  *projectConfig `json:"config"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if !uuidPattern.MatchString(input.ID) || !validRepoURL(input.RepoURL) {
		writeError(w, http.StatusBadRequest, "id must be a UUID and repo_url must be a public HTTPS URL")
		return
	}
	if err := normalizeConfig(input.Config); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	enabled := input.Enabled == nil || *input.Enabled
	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	p, created, err := registerProject(ctx, a.db, input.ID, input.RepoURL, enabled, input.Config)
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeResult(w, status, p, err)
}

func (a api) configureProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusBadRequest, "id must be a UUID")
		return
	}
	var input struct {
		PreviousRevision *int64         `json:"previous_revision"`
		Config           *projectConfig `json:"config"`
	}
	if !readJSON(w, r, &input) {
		return
	}
	if input.PreviousRevision == nil || *input.PreviousRevision < 0 {
		writeError(w, http.StatusBadRequest, "previous_revision must be nonnegative")
		return
	}
	if err := normalizeConfig(input.Config); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	p, err := updateProjectConfig(ctx, a.db, id, *input.PreviousRevision, input.Config)
	writeResult(w, http.StatusOK, p, err)
}

func (a api) listProjects(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	projects, err := watcherProjects(ctx, a.db)
	writeResult(w, http.StatusOK, projects, err)
}

func (a api) observe(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		writeError(w, http.StatusBadRequest, "id must be a UUID")
		return
	}

	var input observation
	if !readJSON(w, r, &input) {
		return
	}
	if input.PreviousRevision == nil || *input.PreviousRevision < 0 ||
		!shaPattern.MatchString(input.SHA) ||
		(input.PreviousSHA != nil && !shaPattern.MatchString(*input.PreviousSHA)) {
		writeError(w, http.StatusBadRequest, "expected a nonnegative previous_revision and valid Git SHA values")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), dbTimeout)
	defer cancel()
	p, err := recordObservation(ctx, a.db, id, input)
	writeResult(w, http.StatusOK, p, err)
}

func serviceAuth(token string, next http.HandlerFunc) http.Handler {
	expected := sha256.Sum256([]byte(token))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		headers := r.Header.Values("Authorization")
		if len(headers) == 1 {
			scheme, value, _ := strings.Cut(headers[0], " ")
			actual := sha256.Sum256([]byte(value))
			if token != "" && strings.EqualFold(scheme, "Bearer") && subtle.ConstantTimeCompare(expected[:], actual[:]) == 1 {
				next(w, r)
				return
			}
		}
		w.Header().Set("WWW-Authenticate", "Bearer")
		writeError(w, http.StatusUnauthorized, "unauthorized")
	})
}

func readJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err == nil && decoder.Decode(new(json.RawMessage)) == io.EOF {
		return true
	}
	writeError(w, http.StatusBadRequest, "invalid JSON request")
	return false
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeResult(w http.ResponseWriter, status int, value any, err error) {
	switch {
	case err == nil:
		writeJSON(w, status, value)
	case errors.Is(err, errConflict):
		writeError(w, http.StatusConflict, "project configuration or observed state conflicts")
	case errors.Is(err, errBuildConflict):
		writeError(w, http.StatusConflict, errBuildConflict.Error())
	case errors.Is(err, errNotFound), errors.Is(err, errBuildNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, errImageDigests):
		writeError(w, http.StatusBadRequest, errImageDigests.Error())
	case errors.Is(err, context.DeadlineExceeded):
		writeError(w, http.StatusServiceUnavailable, "database request timed out")
	default:
		slog.Error("database request failed")
		writeError(w, http.StatusInternalServerError, "database request failed")
	}
}

func validRepoURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.ForceQuery ||
		u.Fragment != "" || u.Opaque != "" || u.Path == "" || u.Path == "/" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	port := u.Port()
	return len(host) <= 253 && asciiDNSName(u.Hostname()) && strings.Contains(host, ".") &&
		!strings.HasSuffix(host, ".localhost") && net.ParseIP(host) == nil && (port == "" || port == "443")
}

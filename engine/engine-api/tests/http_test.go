package tests

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/lib/pq"

	"github.com/ratcker/OpenPage-n/engine/engine-api/internal"
)

const (
	dbTimeout         = 5 * time.Second
	platformTestToken = "platform-test"
	watcherTestToken  = "watcher-test"
	ciTestToken       = "ci-test"
	createPath        = "/internal/v1/projects"
	listPath          = "/internal/v1/watcher/projects"
	projectID         = "0812951a-c377-4045-8c09-83595bd5222d"
	disabledID        = "7ad4d2ed-e588-4809-b686-61b9b5e4275a"
	repoURL           = "https://github.com/example/repository.git"
	basicConfig       = `{"hostname":"demo.example.org","services":{"frontend":{"dockerfile":"web/Dockerfile"}}}`
	shaA              = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	shaB              = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	shaC              = "cccccccccccccccccccccccccccccccccccccccc"
)

type projectResponse struct {
	ID               string  `json:"id"`
	RepoURL          string  `json:"repo_url"`
	ObservedSHA      *string `json:"observed_sha"`
	ObservedRevision int64   `json:"observed_revision"`
}

func request(h http.Handler, method, path, token, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp := httptest.NewRecorder()
	h.ServeHTTP(resp, req)
	return resp
}

func expectStatus(t *testing.T, resp *httptest.ResponseRecorder, want int) {
	t.Helper()
	if resp.Code != want {
		t.Fatalf("status %d, want %d: %s", resp.Code, want, resp.Body)
	}
}

func postProject(h http.Handler, id, repo string, enabled bool) *httptest.ResponseRecorder {
	body := fmt.Sprintf(`{"id":%q,"repo_url":%q,"enabled":%t,"config":%s}`, id, repo, enabled, basicConfig)
	return request(h, http.MethodPost, createPath, platformTestToken, body)
}

func postObservation(h http.Handler, id, previous string, revision int64, sha string) *httptest.ResponseRecorder {
	prev := "null"
	if previous != "" {
		prev = fmt.Sprintf("%q", previous)
	}
	body := fmt.Sprintf(`{"previous_sha":%s,"previous_revision":%d,"sha":%q}`, prev, revision, sha)
	return request(h, http.MethodPost, listPath+"/"+id+"/observations", watcherTestToken, body)
}

func TestAuthAndValidation(t *testing.T) {
	// Эти запросы должны завершиться до обращения к БД.
	h := engineapi.NewHandler(nil, platformTestToken, watcherTestToken, ciTestToken, false)
	for _, tc := range []struct {
		name, method, path, token, body string
		status                          int
	}{
		{"missing auth", "POST", createPath, "", "", 401},
		{"wrong token", "GET", listPath, "wrong", "", 401},
		{"wrong role", "POST", createPath, watcherTestToken, "", 401},
		{"wrong observation role", "POST", listPath + "/" + projectID + "/observations", platformTestToken, "", 401},
		{"invalid id", "POST", createPath, platformTestToken, `{"id":"bad","repo_url":"https://github.com/example/repo"}`, 400},
		{"invalid URL", "POST", createPath, platformTestToken, fmt.Sprintf(`{"id":%q,"repo_url":"http://github.com/example/repo"}`, projectID), 400},
		{"missing revision", "POST", listPath + "/" + projectID + "/observations", watcherTestToken, fmt.Sprintf(`{"sha":%q}`, shaA), 400},
		{"bad SHA", "POST", listPath + "/" + projectID + "/observations", watcherTestToken, `{"previous_sha":null,"previous_revision":0,"sha":"bad"}`, 400},
		{"trailing JSON", "POST", createPath, platformTestToken, `{} {}`, 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			expectStatus(t, request(h, tc.method, tc.path, tc.token, tc.body), tc.status)
		})
	}
}

func TestProjectRegistration(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postProject(h, projectID, repoURL, true), 201)
	repeat := request(h, "POST", createPath, platformTestToken, fmt.Sprintf(`{"id":%q,"repo_url":%q,"config":%s}`, projectID, repoURL, basicConfig))
	expectStatus(t, repeat, 200)
	expectStatus(t, postProject(h, projectID, repoURL+"-other", true), 409)
	expectStatus(t, postProject(h, projectID, repoURL, false), 409)
	expectStatus(t, postProject(h, disabledID, repoURL, false), 201)
	expectStatus(t, postObservation(h, disabledID, "", 0, shaA), 409)
	expectStatus(t, postObservation(h, "279a07fd-8347-4af9-9737-eba9f43ea7f7", "", 0, shaA), 404)

	resp := request(h, "GET", listPath, watcherTestToken, "")
	expectStatus(t, resp, 200)
	var projects []projectResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &projects); err != nil {
		t.Fatal(err)
	}
	if len(projects) != 1 || projects[0].ID != projectID || projects[0].RepoURL != repoURL ||
		projects[0].ObservedSHA != nil || projects[0].ObservedRevision != 0 {
		t.Fatalf("unexpected active projects: %+v", projects)
	}
}

func TestSourceEventRevisions(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postProject(h, projectID, repoURL, true), 201)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaA), 200)
	assertState(t, db, shaA, 1, 1)
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 200)
	expectStatus(t, postObservation(h, projectID, shaC, 1, shaB), 409)
	expectStatus(t, postObservation(h, projectID, shaB, 2, shaA), 200)
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 409)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 409)
	expectStatus(t, postObservation(h, projectID, shaB, 3, shaC), 409)
	assertState(t, db, shaA, 3, 3)

	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	rows, err := db.QueryContext(ctx, `
		SELECT previous_sha, sha, observed_revision FROM source_events
		WHERE project_id = $1 ORDER BY observed_revision`, projectID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for i, want := range []struct{ previous, sha string }{{"", shaA}, {shaA, shaB}, {shaB, shaA}} {
		var previous sql.NullString
		var sha string
		var revision int
		if !rows.Next() {
			t.Fatalf("missing event %d: %v", i+1, rows.Err())
		}
		if err := rows.Scan(&previous, &sha, &revision); err != nil {
			t.Fatal(err)
		}
		if previous.Valid != (want.previous != "") || previous.String != want.previous || sha != want.sha || revision != i+1 {
			t.Fatalf("event %d: got previous=%+v, sha=%q, revision=%d", i+1, previous, sha, revision)
		}
	}
}

func TestConcurrentObservations(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postProject(h, projectID, repoURL, true), 201)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)

	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 3)
	for _, sha := range []string{shaB, shaC} {
		go func(sha string) {
			<-start
			responses <- postObservation(h, projectID, shaA, 1, sha)
		}(sha)
	}
	close(start)
	winner := ""
	conflicts := 0
	for range 2 {
		resp := <-responses
		switch resp.Code {
		case 200:
			var p projectResponse
			if err := json.Unmarshal(resp.Body.Bytes(), &p); err != nil || p.ObservedSHA == nil {
				t.Fatalf("unexpected response: %s (%v)", resp.Body, err)
			}
			winner = *p.ObservedSHA
		case 409:
			conflicts++
		default:
			t.Fatalf("unexpected status %d: %s", resp.Code, resp.Body)
		}
	}
	if conflicts != 1 || (winner != shaB && winner != shaC) {
		t.Fatalf("expected one winner, got SHA %q and %d conflicts", winner, conflicts)
	}

	start = make(chan struct{})
	for range 3 {
		go func() {
			<-start
			responses <- postObservation(h, projectID, winner, 2, shaA)
		}()
	}
	close(start)
	for range 3 {
		expectStatus(t, <-responses, 200)
	}
	assertState(t, db, shaA, 3, 3)
}

func TestObservationRollsBackWhenEventInsertFails(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postProject(h, projectID, repoURL, true), 201)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)

	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	if _, err := db.ExecContext(ctx, `ALTER TABLE source_events ADD CONSTRAINT reject_next_event CHECK (observed_revision <> 2)`); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 500)
	assertState(t, db, shaA, 1, 1)
	if _, err := db.ExecContext(ctx, `ALTER TABLE source_events DROP CONSTRAINT reject_next_event`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		ALTER TABLE builds ADD CONSTRAINT reject_next_build CHECK (status <> 'pending') NOT VALID`); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 500)
	assertState(t, db, shaA, 1, 1)
	assertBuildCounts(t, db, map[string]int{"pending": 1})
	if _, err := db.ExecContext(ctx, `ALTER TABLE builds DROP CONSTRAINT reject_next_build`); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 200)
	assertState(t, db, shaB, 2, 2)
}

func TestMigrationDown(t *testing.T) {
	db, migrations := testDB(t)
	if err := migrations.Down(); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	var gone bool
	if err := db.QueryRowContext(ctx, `
		SELECT count(*) = 0 FROM information_schema.tables
		WHERE table_schema = current_schema() AND table_name IN ('projects', 'source_events', 'builds')`).Scan(&gone); err != nil || !gone {
		t.Fatalf("expected all three tables removed, got %t, err=%v", gone, err)
	}
}

func assertState(t *testing.T, db *sql.DB, wantSHA string, wantRevision int64, wantEvents int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	var sha string
	var revision int64
	var events int
	err := db.QueryRowContext(ctx, `
		SELECT observed_sha, observed_revision,
		       (SELECT count(*) FROM source_events WHERE project_id = $1)
		FROM projects WHERE id = $1`, projectID).Scan(&sha, &revision, &events)
	if err != nil || sha != wantSHA || revision != wantRevision || events != wantEvents {
		t.Fatalf("state got (%q, %d, %d), want (%q, %d, %d), err=%v", sha, revision, events, wantSHA, wantRevision, wantEvents, err)
	}
}

func testDB(t *testing.T) (*sql.DB, *migrate.Migrate) {
	t.Helper()
	dsn := os.Getenv("ENGINE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set ENGINE_TEST_DATABASE_URL to run PostgreSQL integration tests")
	}
	u, err := url.Parse(dsn)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		t.Fatal("ENGINE_TEST_DATABASE_URL must be a PostgreSQL URL")
	}
	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = admin.Close() })

	var suffix [8]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		t.Fatal(err)
	}
	schema := "engine_test_" + hex.EncodeToString(suffix[:])
	name := pq.QuoteIdentifier(schema)
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
		defer cancel()
		if _, err := admin.ExecContext(ctx, "DROP SCHEMA "+name+" CASCADE"); err != nil {
			t.Error(err)
		}
	})

	params := u.Query()
	params.Set("search_path", schema)
	params.Set("connect_timeout", "5")
	u.RawQuery = params.Encode()
	migrations, err := migrate.New("file://../../migrations", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = migrations.Close() })
	if err := migrations.Up(); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("postgres", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db, migrations
}

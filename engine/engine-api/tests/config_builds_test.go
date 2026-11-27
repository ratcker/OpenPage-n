package tests

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/ratcker/OpenPage-n/engine/engine-api/internal"
)

const (
	buildsPath = "/internal/v1/ci/builds"
	claimPath  = buildsPath + "/claim"
	bothConfig = `{"hostname":"demo.example.org","services":{"frontend":{"dockerfile":"web/Dockerfile"},"backend":{"dockerfile":"Dockerfile"}}}`
	frontImage = "ghcr.io/example/frontend@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	backImage  = "ghcr.io/example/backend@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
)

type configResponse struct {
	projectResponse
	ConfigRevision int64 `json:"config_revision"`
	Config         struct {
		Hostname string `json:"hostname"`
		Services map[string]struct {
			Dockerfile string `json:"dockerfile"`
			Context    string `json:"context"`
			Port       int    `json:"port"`
		} `json:"services"`
		Secrets map[string]string `json:"secrets"`
	} `json:"config"`
}

type claimResponse struct {
	ID             string          `json:"id"`
	SourceEventID  string          `json:"source_event_id"`
	ProjectID      string          `json:"project_id"`
	RepoURL        string          `json:"repo_url"`
	SHA            string          `json:"sha"`
	Status         string          `json:"status"`
	ConfigRevision int64           `json:"config_revision"`
	ConfigSnapshot json.RawMessage `json:"config_snapshot"`
}

func TestConfigAndCIValidation(t *testing.T) {
	h := engineapi.NewHandler(nil, platformTestToken, watcherTestToken, ciTestToken, false)
	for _, config := range []string{
		`null`,
		`{"hostname":"домен.example.org","services":{"frontend":{"dockerfile":"Dockerfile"}}}`,
		`{"hostname":"demo.example.org","services":{}}`,
		strings.Replace(basicConfig, "frontend", "worker", 1),
		strings.Replace(basicConfig, "web/Dockerfile", "../Dockerfile", 1),
		strings.Replace(basicConfig, `"web/Dockerfile"`, `"Dockerfile","context":"web/../../outside"`, 1),
		strings.Replace(basicConfig, `"web/Dockerfile"`, `"Dockerfile","port":0`, 1),
		strings.TrimSuffix(basicConfig, "}") + `,"env":{"TOKEN":"one"},"secrets":{"TOKEN":"plaintext"}}`,
		strings.TrimSuffix(basicConfig, "}") + `,"secrets":{"TOKEN":"plaintext"}}`,
		strings.TrimSuffix(basicConfig, "}") + `,"env":{"VAR":null}}`,
	} {
		body := fmt.Sprintf(`{"id":%q,"repo_url":%q,"config":%s}`, projectID, repoURL, config)
		resp := request(h, "POST", createPath, platformTestToken, body)
		expectStatus(t, resp, 400)
		if strings.Contains(resp.Body.String(), "plaintext") {
			t.Fatal("validation returned a supplied secret")
		}
	}
	configPath := createPath + "/" + projectID + "/config"
	expectStatus(t, request(h, "PUT", configPath, ciTestToken, "{}"), 401)
	expectStatus(t, request(h, "POST", claimPath, watcherTestToken, ""), 401)
	expectStatus(t, request(h, "PATCH", buildsPath+"/"+projectID, platformTestToken, "{}"), 401)
	for _, body := range []string{`{}`, `{"pipeline_run":"Not Valid"}`, `{"status":"pending"}`,
		`{"status":"succeeded"}`, `{"status":"succeeded","image_digests":{"frontend":"ghcr.io/example/frontend:latest"}}`,
		`{"status":"failed","image_digests":{}}`} {
		expectStatus(t, request(h, "PATCH", buildsPath+"/"+projectID, ciTestToken, body), 400)
	}
}

func TestProjectConfigRevisions(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	// Конверт тестовый. Проверяем только сохранение ciphertext как непрозрачной строки.
	envelope := make([]byte, 2+256+16)
	envelope[0] = 1
	ciphertext := base64.StdEncoding.EncodeToString(envelope)
	config := strings.TrimSuffix(bothConfig, "}") + fmt.Sprintf(`,"secrets":{"TOKEN":%q}}`, ciphertext)
	config = strings.Replace(config, "demo.example.org", "Demo.Example.org", 1)
	const remote = "https://git.example.org/team/app.git"
	body := fmt.Sprintf(`{"id":%q,"repo_url":%q,"config":%s}`, projectID, remote, config)
	resp := request(h, "POST", createPath, platformTestToken, body)
	expectStatus(t, resp, 201)
	var result configResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	frontend, backend := result.Config.Services["frontend"], result.Config.Services["backend"]
	if result.ConfigRevision != 1 || result.Config.Hostname != "demo.example.org" || result.RepoURL != remote ||
		frontend.Context != "web" || frontend.Port != 80 || backend.Context != "." || backend.Port != 8000 ||
		result.Config.Secrets["TOKEN"] != ciphertext {
		t.Fatal("unexpected normalized project configuration")
	}
	expectStatus(t, request(h, "POST", createPath, platformTestToken, body), 200)
	expectStatus(t, putConfig(h, projectID, 1, strings.Replace(config, "Demo.Example.org", "other.example.org", 1)), 409)
	expectStatus(t, putConfig(h, projectID, 1, config), 200)
	expectStatus(t, putConfig(h, projectID, 1, basicConfig), 200)
	expectStatus(t, putConfig(h, projectID, 1, bothConfig), 409)
	expectStatus(t, putConfig(h, disabledID, 0, basicConfig), 404)
	assertBuildCounts(t, db, map[string]int{})
}

func TestBuildLifecycleAndSnapshot(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	registered := postProject(h, projectID, repoURL, true)
	expectStatus(t, registered, 201)
	var original struct {
		Config json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(registered.Body.Bytes(), &original); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, request(h, "POST", claimPath, ciTestToken, ""), 204)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaA), 200)
	assertBuildCounts(t, db, map[string]int{"pending": 1})
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 200)
	assertBuildCounts(t, db, map[string]int{"pending": 1, "superseded": 1})

	expectStatus(t, putConfig(h, projectID, 1, bothConfig), 200)
	expectStatus(t, postObservation(h, projectID, shaB, 2, shaB), 200)
	assertBuildCounts(t, db, map[string]int{"pending": 1, "superseded": 1})
	first := readClaim(t, request(h, "POST", claimPath, ciTestToken, ""))
	if first.SHA != shaB || first.RepoURL != repoURL || first.ProjectID != projectID ||
		first.ConfigRevision != 1 || first.Status != "running" || first.SourceEventID == "" || first.ID == "" {
		t.Fatal("claim returned unexpected build coordinates")
	}
	if string(first.ConfigSnapshot) != string(original.Config) {
		t.Fatal("claim returned a different configuration snapshot after PUT")
	}
	path := buildsPath + "/" + first.ID
	patch := func(body string, status int) {
		t.Helper()
		expectStatus(t, request(h, "PATCH", path, ciTestToken, body), status)
	}
	patch(`{"pipeline_run":"run-1"}`, 200)
	patch(`{"pipeline_run":"run-1"}`, 200)
	patch(`{"pipeline_run":"run-2"}`, 409)
	assertBuildCounts(t, db, map[string]int{"running": 1, "superseded": 1})
	expectStatus(t, postObservation(h, projectID, shaB, 2, shaC), 200)
	expectStatus(t, request(h, "POST", claimPath, ciTestToken, ""), 204)
	assertBuildCounts(t, db, map[string]int{"pending": 1, "running": 1, "superseded": 1})

	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	if _, err := db.ExecContext(ctx, `UPDATE builds SET config_snapshot = '{}' WHERE id = $1`, first.ID); err == nil {
		t.Fatal("database allowed changing the snapshot")
	}
	var preserved bool
	if err := db.QueryRowContext(ctx, `
		SELECT config_snapshot = $2::jsonb AND config_revision = 1 FROM builds WHERE id = $1`,
		first.ID, string(first.ConfigSnapshot)).Scan(&preserved); err != nil || !preserved {
		t.Fatalf("snapshot changed, query error: %v", err)
	}
	patch(fmt.Sprintf(`{"status":"succeeded","image_digests":{"backend":%q}}`, backImage), 400)
	success := fmt.Sprintf(`{"status":"succeeded","image_digests":{"frontend":%q}}`, frontImage)
	patch(success, 200)
	patch(success, 200)
	patch(`{"pipeline_run":"run-1"}`, 200)
	patch(strings.Replace(success, frontImage, backImage, 1), 409)
	patch(`{"status":"failed"}`, 409)

	next := readClaim(t, request(h, "POST", claimPath, ciTestToken, ""))
	if next.SHA != shaC || next.ConfigRevision != 2 || !strings.Contains(string(next.ConfigSnapshot), `"backend"`) {
		t.Fatal("claim did not include the latest configuration")
	}
	expectStatus(t, request(h, "PATCH", buildsPath+"/"+next.ID, ciTestToken, success), 400)
	expectStatus(t, request(h, "PATCH", buildsPath+"/"+next.ID, ciTestToken, `{"status":"failed"}`), 200)
	expectStatus(t, request(h, "PATCH", buildsPath+"/"+next.ID, ciTestToken, `{"status":"failed"}`), 200)
	expectStatus(t, request(h, "PATCH", buildsPath+"/"+disabledID, ciTestToken, `{"status":"failed"}`), 404)
	assertBuildCounts(t, db, map[string]int{"failed": 1, "succeeded": 1, "superseded": 1})
}

func TestConcurrentClaims(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	for _, id := range []string{projectID, disabledID} {
		expectStatus(t, postProject(h, id, repoURL, true), 201)
		expectStatus(t, postObservation(h, id, "", 0, shaA), 200)
	}
	start := make(chan struct{})
	responses := make(chan *httptest.ResponseRecorder, 8)
	for range cap(responses) {
		go func() {
			<-start
			responses <- request(h, "POST", claimPath, ciTestToken, "")
		}()
	}
	close(start)
	claimed := 0
	for range cap(responses) {
		resp := <-responses
		if resp.Code == 200 {
			claimed++
		} else {
			expectStatus(t, resp, 204)
		}
	}
	if claimed != 1 {
		t.Fatalf("claimed %d builds, want 1", claimed)
	}
	assertBuildCounts(t, db, map[string]int{"pending": 1, "running": 1})
}

func TestClaimSkipsStalePendingBuilds(t *testing.T) {
	db, _ := testDB(t)
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postProject(h, projectID, repoURL, true), 201)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 200)
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	if _, err := db.ExecContext(ctx, `
		UPDATE builds SET status = CASE WHEN status = 'pending' THEN 'superseded' ELSE 'pending' END`); err != nil {
		t.Fatal(err)
	}
	expectStatus(t, request(h, "POST", claimPath, ciTestToken, ""), 204)
}

func TestUpgradePreservesExistingProjects(t *testing.T) {
	db, migrations := testDB(t)
	if err := migrations.Steps(-2); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	if _, err := db.ExecContext(ctx, `INSERT INTO projects (id, repo_url) VALUES ($1, $2)`, projectID, repoURL); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Up(); err != nil {
		t.Fatal(err)
	}
	h := engineapi.NewHandler(db, platformTestToken, watcherTestToken, ciTestToken, false)
	expectStatus(t, postObservation(h, projectID, "", 0, shaA), 200)
	expectStatus(t, putConfig(h, projectID, 0, basicConfig), 200)
	assertBuildCounts(t, db, map[string]int{})
	expectStatus(t, postObservation(h, projectID, shaA, 1, shaB), 200)
	assertBuildCounts(t, db, map[string]int{"pending": 1})
}

func putConfig(h http.Handler, id string, revision int64, config string) *httptest.ResponseRecorder {
	body := fmt.Sprintf(`{"previous_revision":%d,"config":%s}`, revision, config)
	return request(h, "PUT", createPath+"/"+id+"/config", platformTestToken, body)
}

func readClaim(t *testing.T, resp *httptest.ResponseRecorder) claimResponse {
	t.Helper()
	expectStatus(t, resp, 200)
	var result claimResponse
	if err := json.Unmarshal(resp.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func assertBuildCounts(t *testing.T, db *sql.DB, want map[string]int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), dbTimeout)
	defer cancel()
	rows, err := db.QueryContext(ctx, `SELECT status, count(*) FROM builds GROUP BY status`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			t.Fatal(err)
		}
		got[status] = count
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("build counts %v, want %v", got, want)
	}
}

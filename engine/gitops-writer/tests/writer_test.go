package tests

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/ratcker/OpenPage-n/engine/gitops-writer"
	generator "github.com/ratcker/OpenPage-n/engine/manifest-generator"
)

const (
	projectID = "0812951a-c377-4045-8c09-83595bd5222d"
	otherID   = "eeb3f452-c6d7-4631-a9f4-fe4b1d4438b6"
)

func TestPublish(t *testing.T) {
	config, seed := repository(t)
	writer := newWriter(t, config)
	ctx := testContext(t)
	path := "projects/" + projectID

	deploy := deployment(t, projectID, 1)
	service := manifest(t, "apiVersion: v1\nkind: Service\nmetadata:\n  name: app\n  namespace: openpage-"+projectID+"\n")
	namespace := manifest(t, "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: openpage-"+projectID+"\n")
	if err := writer.Write(ctx, strings.ToUpper(projectID), []generator.Manifest{deploy, service, namespace}); err != nil {
		t.Fatal(err)
	}
	deployFile := filename(t, deploy)
	serviceFile := filename(t, service)
	nsFile := filename(t, namespace)
	if got := git(t, config.RepoURL, "ls-tree", "-r", "--name-only", "main", "--", path); got !=
		strings.Join([]string{path + "/" + nsFile, path + "/" + deployFile, path + "/" + serviceFile}, "\n") {
		t.Fatalf("unexpected first publication:\n%s", got)
	}
	if got := git(t, config.RepoURL, "log", "-1", "--format=%an <%ae>", "main"); got != "OpenPage Test <writer@example.test>" {
		t.Fatalf("unexpected commit author: %q", got)
	}

	git(t, seed, "pull", "--ff-only", "origin", "main")
	writeFile(t, seed, "platform/config.yaml", "new platform contents\n", 0644)
	git(t, seed, "add", "--", "platform/config.yaml")
	git(t, seed, "commit", "--no-gpg-sign", "-m", "Update platform")
	git(t, seed, "push", "origin", "main")
	updated := []generator.Manifest{deployment(t, projectID, 2), namespace}
	if err := writer.Write(ctx, projectID, updated); err != nil {
		t.Fatal(err)
	}
	if got := git(t, config.RepoURL, "show", "main:"+path+"/"+deployFile) + "\n"; got != updated[0].Content {
		t.Fatalf("unexpected Deployment:\n%s", got)
	}
	if got := git(t, config.RepoURL, "diff-tree", "--no-commit-id", "--name-only", "-r", "main"); got !=
		strings.Join([]string{path + "/" + deployFile, path + "/" + serviceFile}, "\n") {
		t.Fatalf("unexpected files in update commit:\n%s", got)
	}
	if got := git(t, config.RepoURL, "show", "main:platform/config.yaml"); got != "new platform contents" {
		t.Fatalf("unexpected platform contents: %q", got)
	}
	if got := git(t, config.RepoURL, "show", "main:projects/"+otherID+"/other.yaml"); got != "other project contents" {
		t.Fatalf("unexpected other project contents: %q", got)
	}

	head := git(t, config.RepoURL, "rev-parse", "main")
	if err := writer.Write(ctx, projectID, updated); err != nil {
		t.Fatal(err)
	}
	if got := git(t, config.RepoURL, "rev-parse", "main"); got != head {
		t.Fatal("identical publication changed the branch")
	}
}

func TestWriteRecoversAfterGitErrors(t *testing.T) {
	config, _ := repository(t)
	writer := newWriter(t, config)
	ctx := testContext(t)
	if err := writer.Write(ctx, projectID, []generator.Manifest{deployment(t, projectID, 1)}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, repo, hook string
		replicas         int
	}{
		{"commit", config.LocalPath, ".git/hooks/pre-commit", 2},
		{"push", config.RepoURL, "hooks/pre-receive", 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			head := git(t, config.RepoURL, "rev-parse", "main")
			writeFile(t, tc.repo, tc.hook, "#!/bin/sh\necho test-secret-marker >&2\nexit 1\n", 0700)
			manifests := []generator.Manifest{deployment(t, projectID, tc.replicas)}
			err := writer.Write(ctx, projectID, manifests)
			if err == nil || !strings.Contains(err.Error(), "git "+tc.name) || strings.Contains(err.Error(), "test-secret-marker") {
				t.Fatalf("unexpected publication error: %v", err)
			}
			if got := git(t, config.RepoURL, "rev-parse", "main"); got != head {
				t.Fatal("failed publication changed the remote branch")
			}
			if got := git(t, config.LocalPath, "rev-parse", "HEAD"); got != head {
				t.Fatal("local HEAD was not restored")
			}
			if got := git(t, config.LocalPath, "status", "--porcelain"); got != "" {
				t.Fatalf("local working tree was not restored:\n%s", got)
			}
			if err := os.Remove(filepath.Join(tc.repo, tc.hook)); err != nil {
				t.Fatal(err)
			}
			if err := writer.Write(ctx, projectID, manifests); err != nil {
				t.Fatalf("retry failed: %v", err)
			}
		})
	}
}

func TestWriteRejectsInvalidInput(t *testing.T) {
	config, _ := repository(t)
	writer := newWriter(t, config)
	ctx := testContext(t)
	valid := deployment(t, projectID, 1)
	invalid := valid
	invalid.Content += "---\nkind: Secret\n"
	traversal := manifest(t, strings.ReplaceAll(valid.Content, "name: app", "name: ../../outside"))
	for _, tc := range []struct {
		name, id  string
		manifests []generator.Manifest
	}{
		{"invalid UUID", "../platform", []generator.Manifest{valid}},
		{"empty manifests", projectID, nil},
		{"duplicate", projectID, []generator.Manifest{valid, valid}},
		{"other namespace", projectID, []generator.Manifest{deployment(t, otherID, 1)}},
		{"multiple YAML documents", projectID, []generator.Manifest{invalid}},
		{"filename traversal", projectID, []generator.Manifest{traversal}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := writer.Write(ctx, tc.id, tc.manifests); err == nil {
				t.Fatal("expected validation error")
			}
			if _, err := os.Lstat(config.LocalPath); !os.IsNotExist(err) {
				t.Fatalf("validation created a checkout: %v", err)
			}
		})
	}
}

func TestWriteRejectsSymlinkDirectories(t *testing.T) {
	for _, link := range []string{"projects", "projects/" + projectID} {
		t.Run(link, func(t *testing.T) {
			config, seed := repository(t)
			target := t.TempDir()
			writeFile(t, target, "keep", "outside contents\n", 0644)
			if err := os.RemoveAll(filepath.Join(seed, link)); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(target, filepath.Join(seed, link)); err != nil {
				t.Fatal(err)
			}
			git(t, seed, "add", "-A", "--", link)
			git(t, seed, "commit", "--no-gpg-sign", "-m", "Add symlink")
			git(t, seed, "push", "origin", "main")
			head := git(t, config.RepoURL, "rev-parse", "main")

			writer := newWriter(t, config)
			err := writer.Write(testContext(t), projectID, []generator.Manifest{deployment(t, projectID, 1)})
			if err == nil || !strings.Contains(err.Error(), "symlink") {
				t.Fatalf("expected symlink error, got %v", err)
			}
			entries, err := os.ReadDir(target)
			if err != nil || len(entries) != 1 || entries[0].Name() != "keep" {
				t.Fatalf("symlink target was modified: %v, %v", entries, err)
			}
			if got := git(t, config.RepoURL, "rev-parse", "main"); got != head {
				t.Fatal("rejected publication changed the remote branch")
			}
		})
	}
}

func TestConcurrentWriters(t *testing.T) {
	config, _ := repository(t)
	ctx := testContext(t)
	results := make(chan error, 2)
	for _, id := range []string{projectID, otherID} {
		writer := newWriter(t, config)
		manifests := []generator.Manifest{deployment(t, id, 1)}
		go func() { results <- writer.Write(ctx, id, manifests) }()
	}
	for range 2 {
		if err := <-results; err != nil {
			t.Error(err)
		}
	}
	if t.Failed() {
		return
	}
	got := strings.Split(git(t, config.RepoURL, "log", "-2", "--format=%s", "main"), "\n")
	slices.Sort(got)
	want := []string{"Update project " + projectID, "Update project " + otherID}
	if !slices.Equal(got, want) {
		t.Fatalf("expected both project commits, got %v", got)
	}
}

func repository(t *testing.T) (gitopswriter.Config, string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is required for Writer tests")
	}
	dir := t.TempDir()
	remote := filepath.Join(dir, "remote.git")
	seed := filepath.Join(dir, "seed")
	git(t, dir, "init", "--bare", "--initial-branch=main", remote)
	git(t, dir, "init", "--initial-branch=main", seed)
	writeFile(t, seed, "platform/config.yaml", "platform contents\n", 0644)
	writeFile(t, seed, "projects/"+otherID+"/other.yaml", "other project contents\n", 0644)
	git(t, seed, "add", "--", "platform", "projects")
	git(t, seed, "commit", "--no-gpg-sign", "-m", "Seed repository")
	git(t, seed, "remote", "add", "origin", remote)
	git(t, seed, "push", "origin", "main")
	return gitopswriter.Config{
		RepoURL: remote, Branch: "main", LocalPath: filepath.Join(dir, "writer"),
		AuthorName: "OpenPage Test", AuthorEmail: "writer@example.test",
	}, seed
}

func newWriter(t *testing.T, config gitopswriter.Config) *gitopswriter.Writer {
	t.Helper()
	writer, err := gitopswriter.New(config)
	if err != nil {
		t.Fatal(err)
	}
	return writer
}

func deployment(t *testing.T, id string, replicas int) generator.Manifest {
	t.Helper()
	return manifest(t, fmt.Sprintf("apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: app\n  namespace: openpage-%s\nspec:\n  replicas: %d\n", id, replicas))
}

func manifest(t *testing.T, content string) generator.Manifest {
	t.Helper()
	m, err := generator.ParseManifest(content)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func filename(t *testing.T, m generator.Manifest) string {
	t.Helper()
	name, err := generator.ManifestFilename(m)
	if err != nil {
		t.Fatal(err)
	}
	return name
}

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=Test", "-c", "user.email=test@example.test"}, args...)...)
	cmd.Dir = dir
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "GIT_") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1", "GIT_ALLOW_PROTOCOL=file")
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
	return strings.TrimSuffix(string(output), "\n")
}

func writeFile(t *testing.T, dir, name, content string, mode os.FileMode) {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), mode); err != nil {
		t.Fatal(err)
	}
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	return ctx
}

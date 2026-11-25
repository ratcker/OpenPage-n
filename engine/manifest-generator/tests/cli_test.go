package tests

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
	"gopkg.in/yaml.v3"
)

func TestCLI(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("helm is required for CLI tests")
	}
	binary := filepath.Join(t.TempDir(), "manifest-generator")
	if output, err := exec.Command("go", "build", "-o", binary, "../cmd").CombinedOutput(); err != nil {
		t.Fatalf("build CLI: %v\n%s", err, output)
	}
	engineDir, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	command := func(dir string) *exec.Cmd {
		cmd := exec.Command(binary, "-dir", dir)
		cmd.Dir = engineDir
		return cmd
	}
	generate := func(dir string) string {
		t.Helper()
		output, err := command(dir).CombinedOutput()
		if err != nil {
			t.Fatalf("run CLI: %v\n%s", err, output)
		}
		return string(output)
	}
	fixture, err := os.ReadFile(filepath.Join(chartDir, "tests", "values-two-services.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	var spec manifestgenerator.ReleaseSpec
	if err := yaml.Unmarshal(fixture, &spec); err != nil {
		t.Fatal(err)
	}

	project := t.TempDir()
	release := filepath.Join(project, "release.yaml")
	outputDir := filepath.Join(project, "manifests")
	if err := os.WriteFile(release, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	relative, err := filepath.Rel(engineDir, project)
	if err != nil {
		t.Fatal(err)
	}
	report := generate(relative)
	if !strings.Contains(report, "Generated 6 manifests:") || !strings.Contains(report, "Output: "+outputDir) {
		t.Fatalf("unexpected CLI output:\n%s", report)
	}
	namespace := "openpage-" + spec.Project.ID
	namespaceFile := "00_namespace_v1_" + namespace + ".yaml"
	frontend := "deployment_apps_v1_" + namespace + "_frontend-8335043597c8.yaml"
	frontendService := "service_v1_" + namespace + "_frontend-8335043597c8.yaml"
	first := readManifestFiles(t, outputDir)
	for _, name := range []string{
		frontend,
		frontendService,
		namespaceFile,
		"deployment_apps_v1_" + namespace + "_backend-2d5a602407eb.yaml",
		"service_v1_" + namespace + "_backend-2d5a602407eb.yaml",
		"httproute_gateway.networking.k8s.io_v1_" + namespace + "_" + namespace + ".yaml",
	} {
		if _, exists := first[name]; !exists {
			t.Errorf("missing %s", name)
		}
	}
	if len(first) != 6 || !strings.Contains(first[frontend], "replicas: 2") {
		t.Fatalf("unexpected initial result: %d files, frontend Deployment:\n%s", len(first), first[frontend])
	}

	service := spec.Services["frontend"]
	service.Replicas = 3
	spec.Services["frontend"] = service
	writeRelease(t, release, spec)
	generate(project)
	updated := readManifestFiles(t, outputDir)
	if len(updated) != 6 || !strings.Contains(updated[frontend], "replicas: 3") {
		t.Fatalf("unexpected updated result: %d files, frontend Deployment:\n%s", len(updated), updated[frontend])
	}

	outside := t.TempDir()
	sentinel := filepath.Join(outside, "keep")
	if err := os.WriteFile(sentinel, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(outputDir, "link")); err != nil {
		t.Fatal(err)
	}
	delete(spec.Services, "backend")
	spec.Routes = nil
	valid := writeRelease(t, release, spec)
	generate(project)
	current := readManifestFiles(t, outputDir)
	if len(current) != 3 || current[namespaceFile] != updated[namespaceFile] ||
		strings.TrimSpace(current[frontend]) != strings.TrimSpace(updated[frontend]) ||
		strings.TrimSpace(current[frontendService]) != strings.TrimSpace(updated[frontendService]) {
		t.Fatalf("want only the Namespace and frontend resources, got %d files", len(current))
	}
	if data, err := os.ReadFile(sentinel); err != nil || string(data) != "keep" {
		t.Fatalf("cleanup changed the symlink target: %q, %v", data, err)
	}

	for _, test := range []struct {
		name, want string
		input      []byte
	}{
		{"unknown field", "field typo not found", append(bytes.Clone(valid), []byte("typo: true\n")...)},
		{"missing required data", "project.configRevision is required", bytes.Replace(valid, []byte("configRevision: revision-1"), []byte("configRevision: ''"), 1)},
		{"invalid image", "values don't meet", bytes.Replace(valid, []byte("@sha256:"), []byte(":invalid-"), 1)},
		{"missing release", "release.yaml", nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			if test.input == nil {
				if err := os.Remove(release); err != nil {
					t.Fatal(err)
				}
			} else if err := os.WriteFile(release, test.input, 0600); err != nil {
				t.Fatal(err)
			}
			_, err := command(project).Output()
			exit, ok := err.(*exec.ExitError)
			if !ok || exit.ExitCode() != 1 || !bytes.Contains(exit.Stderr, []byte(test.want)) {
				t.Fatalf("want error containing %q, got %v", test.want, err)
			}
			if got := readManifestFiles(t, outputDir); !reflect.DeepEqual(got, current) {
				t.Fatal("generation failure changed the previous manifests")
			}
		})
	}

	t.Run("symlink output", func(t *testing.T) {
		dir := t.TempDir()
		writeRelease(t, filepath.Join(dir, "release.yaml"), spec)
		link := filepath.Join(dir, "manifests")
		if err := os.Symlink(outside, link); err != nil {
			t.Fatal(err)
		}
		_, err := command(dir).Output()
		exit, ok := err.(*exec.ExitError)
		if !ok || exit.ExitCode() != 1 || !bytes.Contains(exit.Stderr, []byte("symlink")) {
			t.Fatalf("want symlink error, got %v", err)
		}
		if target, err := os.Readlink(link); err != nil || target != outside {
			t.Fatalf("output symlink changed: %q, %v", target, err)
		}
		if got := readManifestFiles(t, outside); !reflect.DeepEqual(got, map[string]string{"keep": "keep"}) {
			t.Fatalf("output symlink target changed: %v", got)
		}
	})

	t.Run("stateful release", func(t *testing.T) {
		fixture, err := os.ReadFile(filepath.Join(chartDir, "tests", "values-stateful.yaml"))
		if err != nil {
			t.Fatal(err)
		}
		dir := t.TempDir()
		if err := os.WriteFile(filepath.Join(dir, "release.yaml"), fixture, 0600); err != nil {
			t.Fatal(err)
		}
		report := generate(dir)
		out := filepath.Join(dir, "manifests")
		files := readManifestFiles(t, out)
		if len(files) != 10 || !strings.Contains(report, "Generated 10 manifests:") {
			t.Fatalf("want 10 stateful manifests, got %d\n%s", len(files), report)
		}
		generate(dir)
		if got := readManifestFiles(t, out); !reflect.DeepEqual(got, files) {
			t.Fatal("repeated generation changed manifests")
		}
	})
}

func writeRelease(t *testing.T, path string, spec manifestgenerator.ReleaseSpec) []byte {
	t.Helper()
	data, err := yaml.Marshal(spec)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	return data
}

func readManifestFiles(t *testing.T, dir string) map[string]string {
	t.Helper()
	files, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	result := make(map[string]string, len(files))
	for _, file := range files {
		data, err := os.ReadFile(filepath.Join(dir, file.Name()))
		if err != nil {
			t.Fatal(err)
		}
		result[file.Name()] = string(data)
	}
	return result
}

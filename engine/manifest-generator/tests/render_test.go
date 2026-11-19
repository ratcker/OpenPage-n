package tests

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
)

const chartDir = "../../charts/openpage-app"

func TestRender(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("helm is required for rendering tests")
	}
	values, err := os.ReadFile(filepath.Join(chartDir, "tests", "values-two-services.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	const release = "sandbox"
	const namespace = "project-sandbox"
	got, err := manifestgenerator.Render(ctx, chartDir, release, namespace, values)
	if err != nil {
		t.Fatal(err)
	}
	want := []struct{ version, kind, name, spec string }{
		{"apps/v1", "Deployment", "backend-2d5a602407eb", "replicas: 1"},
		{"apps/v1", "Deployment", "frontend-8335043597c8", "replicas: 2"},
		{"gateway.networking.k8s.io/v1", "HTTPRoute", "openpage-0812951a-c377-4045-8c09-83595bd5222d", `value: "/api"`},
		{"v1", "Service", "backend-2d5a602407eb", "port: 8000"},
		{"v1", "Service", "frontend-8335043597c8", "port: 80"},
	}
	if len(got) != len(want) {
		t.Fatalf("got %d manifests, want %d", len(got), len(want))
	}
	for i, manifest := range got {
		expected := want[i]
		if manifest.APIVersion != expected.version || manifest.Kind != expected.kind ||
			manifest.Name != expected.name || manifest.Namespace != namespace {
			t.Errorf("resource %d: got %s %s %s/%s, want %s %s %s/%s",
				i, manifest.APIVersion, manifest.Kind, manifest.Namespace, manifest.Name,
				expected.version, expected.kind, namespace, expected.name)
		}
		if !strings.Contains(manifest.Content, expected.spec) || strings.Contains(manifest.Content, "\n---\n") {
			t.Errorf("resource %s/%s has unexpected YAML:\n%s", manifest.Kind, manifest.Name, manifest.Content)
		}
	}

	again, err := manifestgenerator.Render(ctx, chartDir, release, namespace, values)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(again, got) {
		t.Fatal("rendering the same release produced different manifests")
	}

	for _, test := range []struct {
		name, old, replacement, message string
	}{
		{"schema validation", "frontend@sha256:", "frontend:bad-", "values don't meet"},
		{"template validation", "service: backend", "service: missing", "references unknown service"},
	} {
		t.Run(test.name, func(t *testing.T) {
			invalid := bytes.Replace(values, []byte(test.old), []byte(test.replacement), 1)
			got, err := manifestgenerator.Render(ctx, chartDir, release, namespace, invalid)
			if got != nil || err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("got %d manifests and error %v, want %q", len(got), err, test.message)
			}
		})
	}
	t.Run("cancelled render", func(t *testing.T) {
		ctx, cancel := context.WithCancel(ctx)
		cancel()
		_, err := manifestgenerator.Render(ctx, chartDir, release, namespace, values)
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("got %v, want context.Canceled", err)
		}
	})
}

func TestMissingChart(t *testing.T) {
	_, err := manifestgenerator.Render(context.Background(), filepath.Join(chartDir, "missing"), "sandbox", "project-sandbox", nil)
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("got %v, want a missing chart error", err)
	}
}

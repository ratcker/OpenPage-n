package tests

import (
	"bytes"
	"context"
	"os/exec"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
	"gopkg.in/yaml.v3"
)

const (
	webImage   = "ghcr.io/example/web-ui@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	queryImage = "ghcr.io/example/query-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	sourceSHA  = "0123456789abcdef0123456789abcdef01234567"
)

func releaseSpec() manifestgenerator.ReleaseSpec {
	webPort, queryPort, delay := 8080, 9000, 0
	return manifestgenerator.ReleaseSpec{
		Project: manifestgenerator.ProjectSpec{
			ID:             "0812951a-c377-4045-8c09-83595bd5222d",
			Hostname:       "sandbox.xn--e1aamodgc0e.xn--p1ai",
			SourceSHA:      sourceSHA,
			ConfigRevision: "7",
		},
		Services: map[string]manifestgenerator.ServiceSpec{
			"web-ui": {
				Image:    webImage,
				Replicas: 2,
				Port:     &webPort,
				Resources: manifestgenerator.Resources{
					Requests: manifestgenerator.ResourceList{CPU: "100m", Memory: "64Mi"},
					Limits:   manifestgenerator.ResourceList{CPU: "1", Memory: "128Mi"},
				},
				Env: map[string]string{"API_PATH": "/api", "FEATURE_ENABLED": "true"},
				ReadinessProbe: &manifestgenerator.ReadinessProbe{
					HTTPGet:             &manifestgenerator.HTTPGetProbe{Port: webPort, Path: "/healthz"},
					InitialDelaySeconds: &delay,
				},
			},
			"query-api": {
				Image:    queryImage,
				Replicas: 0,
				Port:     &queryPort,
				Resources: manifestgenerator.Resources{
					Requests: manifestgenerator.ResourceList{CPU: "200m", Memory: "128Mi"},
					Limits:   manifestgenerator.ResourceList{CPU: "500m", Memory: "256Mi"},
				},
			},
		},
		Routes: []manifestgenerator.RouteSpec{
			{Path: "/", Service: "web-ui"},
			{Path: "/api", Service: "query-api"},
		},
		Gateway: manifestgenerator.GatewaySpec{Name: "public", Namespace: "envoy-gateway-system"},
	}
}

func TestBuildValues(t *testing.T) {
	spec := releaseSpec()
	values, err := manifestgenerator.BuildValues(spec)
	if err != nil {
		t.Fatal(err)
	}
	const expected = `project:
  id: 0812951a-c377-4045-8c09-83595bd5222d
  hostname: sandbox.xn--e1aamodgc0e.xn--p1ai
  sourceSHA: "` + sourceSHA + `"
  configRevision: "7"
services:
  web-ui:
    image: ` + webImage + `
    replicas: 2
    port: 8080
    resources:
      requests: {cpu: "100m", memory: "64Mi"}
      limits: {cpu: "1", memory: "128Mi"}
    env: {API_PATH: /api, FEATURE_ENABLED: "true"}
    readinessProbe:
      httpGet: {port: 8080, path: /healthz}
      initialDelaySeconds: 0
  query-api:
    image: ` + queryImage + `
    replicas: 0
    port: 9000
    resources:
      requests: {cpu: "200m", memory: "128Mi"}
      limits: {cpu: "500m", memory: "256Mi"}
routes:
  - {path: /, service: web-ui}
  - {path: /api, service: query-api}
gateway: {name: public, namespace: envoy-gateway-system}
`
	var got, want map[string]any
	if err := yaml.Unmarshal(values, &got); err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal([]byte(expected), &want); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected values:\n%s", values)
	}

	again, err := manifestgenerator.BuildValues(releaseSpec())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(values, again) {
		t.Fatal("building the same release produced different values")
	}
}

func TestBuildValuesWithoutRoutes(t *testing.T) {
	spec := releaseSpec()
	spec.Routes = nil
	spec.Gateway = manifestgenerator.GatewaySpec{}
	service := spec.Services["query-api"]
	service.Port = nil
	spec.Services = map[string]manifestgenerator.ServiceSpec{"query-api": service}

	values, err := manifestgenerator.BuildValues(spec)
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Services map[string]map[string]any
		Routes   []any
		Gateway  map[string]any
	}
	if err := yaml.Unmarshal(values, &got); err != nil {
		t.Fatal(err)
	}
	if _, present := got.Services["query-api"]["port"]; present || !reflect.DeepEqual(got.Routes, []any{}) ||
		!reflect.DeepEqual(got.Gateway, map[string]any{}) {
		t.Fatalf("unexpected values for a service without an HTTP port:\n%s", values)
	}
}

func TestBuildValuesMissingData(t *testing.T) {
	for _, test := range []struct {
		want   string
		remove func(*manifestgenerator.ReleaseSpec)
	}{
		{"project.id", func(spec *manifestgenerator.ReleaseSpec) { spec.Project.ID = "" }},
		{"project.hostname", func(spec *manifestgenerator.ReleaseSpec) { spec.Project.Hostname = "" }},
		{"project.sourceSHA", func(spec *manifestgenerator.ReleaseSpec) { spec.Project.SourceSHA = "" }},
		{"project.configRevision", func(spec *manifestgenerator.ReleaseSpec) { spec.Project.ConfigRevision = "" }},
		{"at least one service", func(spec *manifestgenerator.ReleaseSpec) { spec.Services = nil }},
		{"image is required", func(spec *manifestgenerator.ReleaseSpec) {
			service := spec.Services["web-ui"]
			service.Image = ""
			spec.Services["web-ui"] = service
		}},
		{"resource requests", func(spec *manifestgenerator.ReleaseSpec) {
			service := spec.Services["web-ui"]
			service.Resources.Requests.Memory = ""
			spec.Services["web-ui"] = service
		}},
		{"route 1", func(spec *manifestgenerator.ReleaseSpec) { spec.Routes[0].Path = "" }},
		{"gateway.namespace", func(spec *manifestgenerator.ReleaseSpec) { spec.Gateway.Namespace = "" }},
	} {
		t.Run(test.want, func(t *testing.T) {
			spec := releaseSpec()
			test.remove(&spec)
			values, err := manifestgenerator.BuildValues(spec)
			if values != nil || err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("got values %q and error %v, want error containing %q", values, err, test.want)
			}
		})
	}
}

func TestRenderBuiltValues(t *testing.T) {
	if _, err := exec.LookPath("helm"); err != nil {
		t.Skip("helm is required for rendering tests")
	}
	values, err := manifestgenerator.BuildValues(releaseSpec())
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	manifests, err := manifestgenerator.Render(ctx, chartDir, "sandbox", projectNamespace, values)
	if err != nil {
		t.Fatal(err)
	}
	got := make(map[string]int)
	for _, manifest := range manifests {
		got[manifest.Kind]++
	}
	want := map[string]int{"Namespace": 1, "Deployment": 2, "Service": 2, "HTTPRoute": 1}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got resource counts %v, want %v", got, want)
	}
}

func TestBuildValuesRejectsPlaintextSecrets(t *testing.T) {
	const plaintext = "fixture-only-password"
	for _, value := range []string{plaintext, "Zml4dHVyZS1vbmx5LXBhc3N3b3Jk"} {
		spec := releaseSpec()
		spec.SealedSecrets = map[string]manifestgenerator.SealedSecretSpec{
			"db-credentials": {EncryptedData: map[string]string{"password": value}},
		}
		values, err := manifestgenerator.BuildValues(spec)
		if values != nil || err == nil || !strings.Contains(err.Error(), "expected a Sealed Secrets ciphertext") ||
			strings.Contains(err.Error(), value) {
			t.Fatal("expected ciphertext validation to reject the input without revealing it")
		}
	}
}

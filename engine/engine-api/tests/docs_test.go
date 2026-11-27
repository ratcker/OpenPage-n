package tests

import (
	"net/http"
	"strings"
	"testing"

	"github.com/ratcker/OpenPage-n/engine/engine-api/internal"
)

func TestSwaggerRoutes(t *testing.T) {
	enabled := engineapi.NewHandler(nil, platformTestToken, watcherTestToken, ciTestToken, true)
	disabled := engineapi.NewHandler(nil, platformTestToken, watcherTestToken, ciTestToken, false)

	for _, file := range []struct {
		path, contentType string
		markers           []string
	}{
		{"/docs", "text/html", []string{"ОпенПейч Engine API", "openpage-docs-header", "/docs/mark.svg", "/docs/swagger-theme.css", "/docs/swagger-ui.css", "/docs/swagger-ui-bundle.js", "/docs/swagger-init.js"}},
		{"/docs/openapi.yaml", "application/yaml", []string{"openapi: 3.1.0", "title: ОпенПейч Engine API", createPath, listPath, listPath + "/{id}/observations", createPath + "/{id}/config", claimPath, buildsPath + "/{id}", "CIBearer"}},
		{"/docs/swagger-init.js", "text/javascript", []string{"SwaggerUIBundle", "/docs/openapi.yaml", "validatorUrl: null"}},
		{"/docs/swagger-ui-bundle.js", "text/javascript", []string{"SwaggerUIBundle"}},
		{"/docs/swagger-ui.css", "text/css", []string{".swagger-ui"}},
		{"/docs/swagger-theme.css", "text/css", []string{".openpage-docs-header", "--op-purple"}},
		{"/docs/mark.svg", "image/svg+xml", []string{"<svg", "openpage-mark"}},
	} {
		t.Run(file.path, func(t *testing.T) {
			resp := request(enabled, http.MethodGet, file.path, "", "")
			expectStatus(t, resp, http.StatusOK)
			if got := resp.Header().Get("Content-Type"); !strings.HasPrefix(got, file.contentType) {
				t.Errorf("Content-Type = %q, want %q", got, file.contentType)
			}
			body := resp.Body.String()
			for _, marker := range file.markers {
				if !strings.Contains(body, marker) {
					t.Errorf("missing %q", marker)
				}
			}
			expectStatus(t, request(disabled, http.MethodGet, file.path, "", ""), http.StatusNotFound)
		})
	}

	expectStatus(t, request(enabled, http.MethodGet, listPath, "", ""), http.StatusUnauthorized)
}

package manifestgenerator

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
)

// Render рендерит локальный chart по подготовленным values в формате YAML или JSON.
func Render(ctx context.Context, chartDir, release, namespace string, values []byte) ([]Manifest, error) {
	if chartDir == "" || namespace == "" {
		return nil, errors.New("chart directory and namespace are required")
	}
	dir, err := filepath.Abs(chartDir)
	if err != nil {
		return nil, fmt.Errorf("resolve chart path: %w", err)
	}
	info, err := os.Stat(dir)
	if err != nil {
		return nil, fmt.Errorf("load chart: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("load chart: %q is not a directory", dir)
	}

	cmd := exec.CommandContext(ctx, "helm", "template", "--dry-run=client",
		"--namespace", namespace, "--values", "-", "--", release, dir)
	cmd.Stdin = bytes.NewReader(values)
	output, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return nil, fmt.Errorf("helm template: %w", ctx.Err())
		}
		var exit *exec.ExitError
		if errors.As(err, &exit) && len(exit.Stderr) > 0 {
			return nil, fmt.Errorf("helm template: %w: %s", err, bytes.TrimSpace(exit.Stderr))
		}
		return nil, fmt.Errorf("helm template: %w", err)
	}
	return splitManifests(output)
}

func splitManifests(output []byte) ([]Manifest, error) {
	// Helm отделяет манифесты строкой ---. Сохраняем исходный YAML каждого ресурса.
	docs := bytes.Split(bytes.TrimPrefix(output, []byte("---\n")), []byte("\n---\n"))
	manifests := make([]Manifest, 0, len(docs))
	for i, doc := range docs {
		if len(bytes.TrimSpace(doc)) == 0 {
			continue
		}
		content := string(doc)
		if i < len(docs)-1 {
			content += "\n"
		}
		manifest, err := ParseManifest(content)
		if err != nil {
			return nil, fmt.Errorf("read rendered manifest %d: %w", i+1, err)
		}
		manifests = append(manifests, manifest)
	}
	slices.SortFunc(manifests, func(a, b Manifest) int {
		return cmp.Or(cmp.Compare(a.Kind, b.Kind), cmp.Compare(a.Namespace, b.Namespace), cmp.Compare(a.Name, b.Name))
	})
	return manifests, nil
}

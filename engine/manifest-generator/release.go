package manifestgenerator

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// RenderReleaseFile читает release.yaml и возвращает UUID проекта и его манифесты.
func RenderReleaseFile(ctx context.Context, chartDir, path string) (string, []Manifest, error) {
	spec, err := readRelease(path)
	if err != nil {
		return "", nil, err
	}
	values, err := BuildValues(spec)
	if err != nil {
		return "", nil, fmt.Errorf("build values: %w", err)
	}
	projectID := strings.ToLower(spec.Project.ID)
	name := "openpage-" + projectID
	manifests, err := Render(ctx, chartDir, name, name, values)
	if err != nil {
		return "", nil, err
	}
	return projectID, manifests, nil
}

func readRelease(path string) (ReleaseSpec, error) {
	var spec ReleaseSpec
	file, err := os.Open(path)
	if err != nil {
		return spec, err
	}
	defer file.Close()

	decoder := yaml.NewDecoder(file)
	decoder.KnownFields(true)
	if err := decoder.Decode(&spec); err != nil {
		return spec, fmt.Errorf("decode %s: %w", path, err)
	}
	var extra yaml.Node
	if err := decoder.Decode(&extra); err != io.EOF {
		return spec, errors.New("release.yaml must contain exactly one YAML document")
	}
	return spec, nil
}

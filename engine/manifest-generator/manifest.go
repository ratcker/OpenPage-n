package manifestgenerator

import (
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

type Manifest struct {
	APIVersion string
	Kind       string
	Namespace  string
	Name       string
	Content    string
}

// ParseManifest читает метаданные одного ресурса и сохраняет исходный YAML.
func ParseManifest(content string) (Manifest, error) {
	var header struct {
		APIVersion string `yaml:"apiVersion"`
		Kind       string
		Metadata   struct {
			Namespace string
			Name      string
		}
	}
	decoder := yaml.NewDecoder(strings.NewReader(content))
	if err := decoder.Decode(&header); err != nil {
		return Manifest{}, err
	}
	var extra yaml.Node
	if err := decoder.Decode(&extra); err != io.EOF {
		return Manifest{}, errors.New("expected one YAML document")
	}
	if header.APIVersion == "" || header.Kind == "" || header.Metadata.Name == "" {
		return Manifest{}, errors.New("missing apiVersion, kind or metadata.name")
	}
	if header.Kind != "Namespace" && header.Metadata.Namespace == "" {
		return Manifest{}, errors.New("missing metadata.namespace")
	}
	return Manifest{
		APIVersion: header.APIVersion,
		Kind:       header.Kind,
		Namespace:  header.Metadata.Namespace,
		Name:       header.Metadata.Name,
		Content:    content,
	}, nil
}

var filenamePart = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.-]*$`)

// ManifestFilename возвращает одинаковое имя файла для CLI и GitOps Writer.
func ManifestFilename(manifest Manifest) (string, error) {
	api := strings.SplitN(manifest.APIVersion, "/", 2)
	parts := append([]string{strings.ToLower(manifest.Kind)}, api...)
	if manifest.Namespace != "" {
		parts = append(parts, manifest.Namespace)
	}
	parts = append(parts, manifest.Name)
	for _, part := range parts {
		if !filenamePart.MatchString(part) {
			return "", fmt.Errorf("invalid filename component %q for %s/%s", part, manifest.Kind, manifest.Name)
		}
	}
	name := strings.Join(parts, "_") + ".yaml"
	if manifest.Kind == "Namespace" {
		name = "00_" + name
	}
	return name, nil
}

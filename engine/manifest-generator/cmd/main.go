package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
	"gopkg.in/yaml.v3"
)

func main() {
	dir := flag.String("dir", "", "project directory containing release.yaml")
	flag.Usage = func() {
		fmt.Fprintln(flag.CommandLine.Output(), "Run from engine/: go run ./manifest-generator/cmd -dir <project>")
		flag.PrintDefaults()
	}
	flag.Parse()
	if *dir == "" || flag.NArg() != 0 {
		flag.Usage()
		os.Exit(2)
	}
	if err := generate(*dir); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func generate(dir string) error {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return err
	}
	spec, err := readRelease(filepath.Join(dir, "release.yaml"))
	if err != nil {
		return err
	}
	values, err := manifestgenerator.BuildValues(spec)
	if err != nil {
		return fmt.Errorf("build values: %w", err)
	}
	name := "openpage-" + strings.ToLower(spec.Project.ID)
	manifests, err := manifestgenerator.Render(context.Background(), "charts/openpage-app", name, name, values)
	if err != nil {
		return err
	}
	if err := saveManifests(dir, manifests); err != nil {
		return fmt.Errorf("save manifests: %w", err)
	}

	fmt.Printf("Generated %d manifests:\n", len(manifests))
	for _, manifest := range manifests {
		fmt.Printf("  %s/%s\n", manifest.Kind, manifest.Name)
	}
	fmt.Printf("\nOutput: %s\n", filepath.Join(dir, "manifests"))
	return nil
}

func readRelease(path string) (manifestgenerator.ReleaseSpec, error) {
	var spec manifestgenerator.ReleaseSpec
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

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
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
	_, manifests, err := manifestgenerator.RenderReleaseFile(context.Background(), "charts/openpage-app", filepath.Join(dir, "release.yaml"))
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

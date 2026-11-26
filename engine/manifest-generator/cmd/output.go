package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
)

func saveManifests(dir string, manifests []manifestgenerator.Manifest) error {
	work, err := os.MkdirTemp(dir, ".manifests-")
	if err != nil {
		return err
	}
	defer os.Remove(work)

	next := filepath.Join(work, "next")
	if err := os.Mkdir(next, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(next)
	names := make(map[string]bool, len(manifests))
	for _, manifest := range manifests {
		name, err := manifestgenerator.ManifestFilename(manifest)
		if err != nil {
			return err
		}
		if names[name] {
			return fmt.Errorf("duplicate manifest filename %q", name)
		}
		names[name] = true
		if err := os.WriteFile(filepath.Join(next, name), []byte(manifest.Content), 0644); err != nil {
			return err
		}
	}

	output := filepath.Join(dir, "manifests")
	backup := filepath.Join(work, "previous")
	info, err := os.Lstat(output)
	switch {
	case err == nil:
		if !info.IsDir() {
			return fmt.Errorf("%s must be a directory, not a symlink or file", output)
		}
		if err := os.Rename(output, backup); err != nil {
			return err
		}
	case !errors.Is(err, os.ErrNotExist):
		return err
	}
	if err := os.Rename(next, output); err != nil {
		if info != nil {
			if restoreErr := os.Rename(backup, output); restoreErr != nil {
				return fmt.Errorf("replace manifests: %w (could not restore %s: %w)", err, backup, restoreErr)
			}
		}
		return err
	}
	if err := os.RemoveAll(backup); err != nil {
		return fmt.Errorf("installed new manifests but could not remove previous files: %w", err)
	}
	return nil
}

package gitopswriter

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	generator "github.com/ratcker/OpenPage-n/engine/manifest-generator"
)

type Config struct {
	RepoURL     string
	Branch      string
	LocalPath   string
	SSHKeyPath  string
	AuthorName  string
	AuthorEmail string
}

type Writer struct {
	config Config
}

// New настраивает Writer для отдельной рабочей копии GitOps-репозитория.
func New(config Config) (*Writer, error) {
	if config.RepoURL == "" {
		config.RepoURL = "git@github.com:openpage-dot-rf/OpenPage-GitOps.git"
	}
	if config.Branch == "" {
		config.Branch = "main"
	}
	if strings.HasPrefix(config.Branch, "-") {
		return nil, errors.New("invalid Git branch")
	}
	if config.LocalPath == "" || strings.TrimSpace(config.AuthorName) == "" || strings.TrimSpace(config.AuthorEmail) == "" {
		return nil, errors.New("local path, author name and author email are required")
	}
	local, err := filepath.Abs(config.LocalPath)
	if err != nil {
		return nil, err
	}
	if filepath.Dir(local) == local {
		return nil, errors.New("local path must not be the filesystem root")
	}
	config.LocalPath = local

	if !filepath.IsAbs(config.RepoURL) {
		host, path, scp := strings.Cut(config.RepoURL, ":")
		if !strings.HasPrefix(config.RepoURL, "ssh://") &&
			(!scp || host == "" || path == "" || strings.HasPrefix(path, ":") ||
				strings.ContainsAny(host, "/\\") || strings.Contains(config.RepoURL, "://")) {
			return nil, errors.New("repository URL must use SSH or be an absolute local path")
		}
		if config.SSHKeyPath == "" {
			return nil, errors.New("SSH key path is required for an SSH repository")
		}
		config.SSHKeyPath, err = filepath.Abs(config.SSHKeyPath)
		if err != nil {
			return nil, err
		}
		info, err := os.Stat(config.SSHKeyPath)
		if err != nil || !info.Mode().IsRegular() {
			return nil, errors.New("SSH key must be an accessible regular file")
		}
	} else {
		config.RepoURL = filepath.Clean(config.RepoURL)
		config.SSHKeyPath = ""
	}
	return &Writer{config: config}, nil
}

var uuid = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Write заменяет манифесты проекта и публикует изменения в настроенную ветку.
func (w *Writer) Write(ctx context.Context, projectID string, manifests []generator.Manifest) error {
	projectID = strings.ToLower(projectID)
	if !uuid.MatchString(projectID) {
		return errors.New("invalid project UUID")
	}
	if len(manifests) == 0 {
		return errors.New("at least one manifest is required")
	}
	files := make(map[string]string, len(manifests))
	namespace := "openpage-" + projectID
	for i, manifest := range manifests {
		parsed, err := generator.ParseManifest(manifest.Content)
		if err != nil || parsed != manifest {
			return fmt.Errorf("manifest %d has invalid YAML or mismatched metadata", i+1)
		}
		if manifest.Kind == "Namespace" {
			if manifest.APIVersion != "v1" || manifest.Namespace != "" || manifest.Name != namespace {
				return fmt.Errorf("manifest %d must define the project namespace", i+1)
			}
		} else if manifest.Namespace != namespace {
			return fmt.Errorf("manifest %d must belong to the project namespace", i+1)
		}
		name, err := generator.ManifestFilename(manifest)
		if err != nil {
			return fmt.Errorf("manifest %d has invalid filename metadata", i+1)
		}
		if _, exists := files[name]; exists {
			return fmt.Errorf("manifest %d has a duplicate filename", i+1)
		}
		files[name] = manifest.Content
	}

	if _, err := w.git(ctx, "", "check-ref-format", "refs/heads/"+w.config.Branch); err != nil {
		return fmt.Errorf("check configured Git branch: %w", err)
	}
	repo := w.config.LocalPath
	if err := os.MkdirAll(filepath.Dir(repo), 0755); err != nil {
		return err
	}
	lock, err := lockRepository(ctx, repo+".lock")
	if err != nil {
		return fmt.Errorf("lock local repository: %w", err)
	}
	defer lock.Close()

	base, err := w.syncRepository(ctx)
	if err != nil {
		return err
	}
	return w.writeProject(ctx, base, projectID, files)
}

func (w *Writer) writeProject(ctx context.Context, base, projectID string, files map[string]string) error {
	repo := w.config.LocalPath
	projects := filepath.Join(repo, "projects")
	exists, err := isDirectory(projects)
	if err != nil {
		return err
	}
	if !exists {
		if err := os.Mkdir(projects, 0755); err != nil {
			return err
		}
		defer os.Remove(projects)
	}
	project := filepath.Join(projects, projectID)
	hadProject, err := isDirectory(project)
	if err != nil {
		return err
	}
	work, err := os.MkdirTemp(projects, ".gitops-")
	if err != nil {
		return err
	}
	defer os.Remove(work)
	next := filepath.Join(work, "next")
	if err := os.Mkdir(next, 0755); err != nil {
		return err
	}
	defer os.RemoveAll(next)
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(next, name), []byte(content), 0644); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	previous := filepath.Join(work, "previous")
	if hadProject {
		if err := os.Rename(project, previous); err != nil {
			return err
		}
	}
	if err := os.Rename(next, project); err != nil {
		if hadProject {
			return errors.Join(err, os.Rename(previous, project))
		}
		return err
	}

	if err := w.publish(ctx, projectID); err != nil {
		// Отмена публикации не должна прерывать восстановление рабочей копии.
		recovery, cancel := context.WithTimeout(context.WithoutCancel(ctx), 15*time.Second)
		defer cancel()
		_, resetErr := w.git(recovery, repo, "reset", "--mixed", "--no-refresh", base)
		restoreErr := os.RemoveAll(project)
		if restoreErr == nil && hadProject {
			restoreErr = os.Rename(previous, project)
		}
		if recoveryErr := errors.Join(resetErr, restoreErr); recoveryErr != nil {
			return errors.Join(err, fmt.Errorf("recover local repository: %w", recoveryErr))
		}
		return err
	}
	return os.RemoveAll(previous)
}

func isDirectory(path string) (bool, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !info.IsDir() {
		return false, fmt.Errorf("%s must be a directory without a symlink", path)
	}
	return true, nil
}

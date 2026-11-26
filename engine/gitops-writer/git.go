package gitopswriter

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func (w *Writer) syncRepository(ctx context.Context) (string, error) {
	repo := w.config.LocalPath
	exists, err := isDirectory(repo)
	if err != nil {
		return "", err
	}
	if exists {
		entries, err := os.ReadDir(repo)
		if err != nil {
			return "", err
		}
		exists = len(entries) != 0
	}
	if !exists {
		if err := w.clone(ctx); err != nil {
			return "", err
		}
	}
	if ok, err := isDirectory(filepath.Join(repo, ".git")); err != nil || !ok {
		return "", errors.New("local path must be a standalone Git clone")
	}
	top, err := w.git(ctx, repo, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", err
	}
	resolved, err := filepath.EvalSymlinks(repo)
	if err != nil {
		return "", err
	}
	if top != resolved {
		return "", errors.New("local path does not match the Git working tree")
	}
	fetchURL, err := w.git(ctx, repo, "remote", "get-url", "--all", "origin")
	if err != nil {
		return "", err
	}
	pushURL, err := w.git(ctx, repo, "remote", "get-url", "--push", "--all", "origin")
	if err != nil {
		return "", err
	}
	if fetchURL != w.config.RepoURL || pushURL != w.config.RepoURL {
		return "", errors.New("local origin does not match the configured repository")
	}

	branchRef := "refs/heads/" + w.config.Branch
	head, err := w.git(ctx, repo, "symbolic-ref", "--quiet", "HEAD")
	if err != nil {
		return "", err
	}
	if head != branchRef {
		return "", errors.New("local checkout is not on the configured branch")
	}
	status, err := w.git(ctx, repo, "status", "--porcelain=v1", "--untracked-files=all", "--ignored")
	if err != nil {
		return "", err
	}
	if status != "" {
		return "", errors.New("local GitOps checkout must be clean")
	}
	if _, err := w.git(ctx, repo, "fetch", "--no-tags", "--no-recurse-submodules", "origin", branchRef); err != nil {
		return "", err
	}
	if _, err := w.git(ctx, repo, "merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"); err != nil {
		return "", fmt.Errorf("local branch cannot be fast-forwarded: %w", err)
	}
	if _, err := w.git(ctx, repo, "merge", "--ff-only", "FETCH_HEAD"); err != nil {
		return "", err
	}
	return w.git(ctx, repo, "rev-parse", "HEAD")
}

func (w *Writer) clone(ctx context.Context) error {
	parent := filepath.Dir(w.config.LocalPath)
	dir, err := os.MkdirTemp(parent, ".gitops-clone-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	if _, err := w.git(ctx, parent, "clone", "--no-local", "--no-tags", "--single-branch",
		"--branch", w.config.Branch, "--", w.config.RepoURL, dir); err != nil {
		return err
	}
	return os.Rename(dir, w.config.LocalPath)
}

func (w *Writer) publish(ctx context.Context, projectID string) error {
	repo := w.config.LocalPath
	path := "projects/" + projectID
	if _, err := w.git(ctx, repo, "add", "-A", "--", path); err != nil {
		return err
	}
	if _, err := w.git(ctx, repo, "diff", "--cached", "--quiet", "--", path); err == nil {
		return nil
	} else {
		var exit *exec.ExitError
		if !errors.As(err, &exit) || exit.ExitCode() != 1 {
			return err
		}
	}
	if _, err := w.git(ctx, repo, "commit", "--no-gpg-sign", "-m", "Update project "+projectID, "--", path); err != nil {
		return err
	}
	_, err := w.git(ctx, repo, "push", "--no-follow-tags", "--recurse-submodules=no",
		"origin", "HEAD:refs/heads/"+w.config.Branch)
	return err
}

func (w *Writer) git(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	// stderr может содержать чувствительные данные из SSH или удалённых хуков.
	cmd.Stderr = io.Discard
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if err := syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM); err != syscall.ESRCH {
			return err
		}
		return os.ErrProcessDone
	}
	cmd.WaitDelay = 2 * time.Second
	// Переменные Git из окружения могут перенаправить команду в другой репозиторий.
	for _, variable := range os.Environ() {
		if !strings.HasPrefix(variable, "GIT_") {
			cmd.Env = append(cmd.Env, variable)
		}
	}
	cmd.Env = append(cmd.Env,
		"GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_TERMINAL_PROMPT=0",
		"GIT_ALLOW_PROTOCOL=file:ssh",
		"GIT_AUTHOR_NAME="+w.config.AuthorName,
		"GIT_AUTHOR_EMAIL="+w.config.AuthorEmail,
		"GIT_COMMITTER_NAME="+w.config.AuthorName,
		"GIT_COMMITTER_EMAIL="+w.config.AuthorEmail,
	)
	if key := w.config.SSHKeyPath; key != "" {
		quoted := "'" + strings.ReplaceAll(key, "'", "'\\''") + "'"
		cmd.Env = append(cmd.Env,
			"GIT_SSH_COMMAND=ssh -F "+os.DevNull+" -o BatchMode=yes -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -i "+quoted)
	}
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			err = ctx.Err()
		}
		return "", fmt.Errorf("git %s: %w", args[0], err)
	}
	return strings.TrimSuffix(string(out), "\n"), nil
}

func lockRepository(ctx context.Context, path string) (*os.File, error) {
	fd, err := syscall.Open(path, syscall.O_CREAT|syscall.O_RDWR|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0600)
	if err != nil {
		return nil, err
	}
	file := os.NewFile(uintptr(fd), path)
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		file.Close()
		return nil, errors.New("repository lock must be a regular file")
	}

	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		if err := syscall.Flock(fd, syscall.LOCK_EX|syscall.LOCK_NB); err == nil {
			return file, nil
		} else if err != syscall.EWOULDBLOCK && err != syscall.EINTR {
			file.Close()
			return nil, err
		}
		select {
		case <-ctx.Done():
			file.Close()
			return nil, ctx.Err()
		case <-ticker.C:
		}
	}
}

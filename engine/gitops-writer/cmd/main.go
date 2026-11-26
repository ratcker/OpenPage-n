package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/ratcker/OpenPage-n/engine/gitops-writer"
	"github.com/ratcker/OpenPage-n/engine/manifest-generator"
)

func main() {
	var config gitopswriter.Config
	dir := flag.String("dir", "", "каталог с release.yaml")
	flag.StringVar(&config.LocalPath, "repo-dir", "", "путь к отдельной рабочей копии GitOps")
	flag.StringVar(&config.SSHKeyPath, "ssh-key", "", "путь к приватному SSH-ключу")
	flag.StringVar(&config.AuthorName, "author-name", "", "имя автора коммитов")
	flag.StringVar(&config.AuthorEmail, "author-email", "", "email автора коммитов")
	flag.Usage = func() {
		fmt.Fprintln(flag.CommandLine.Output(), "Запуск из engine/: go run ./gitops-writer/cmd [флаги]")
		flag.PrintDefaults()
	}
	flag.Parse()
	if *dir == "" || config.LocalPath == "" || config.SSHKeyPath == "" ||
		config.AuthorName == "" || config.AuthorEmail == "" || flag.NArg() != 0 {
		flag.Usage()
		os.Exit(2)
	}
	if err := run(*dir, config); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(dir string, config gitopswriter.Config) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	projectID, manifests, err := manifestgenerator.RenderReleaseFile(ctx, "charts/openpage-app", filepath.Join(dir, "release.yaml"))
	if err != nil {
		return err
	}
	writer, err := gitopswriter.New(config)
	if err != nil {
		return err
	}
	if err := writer.Write(ctx, projectID, manifests); err != nil {
		return err
	}
	fmt.Printf("GitOps синхронизирован для проекта %s (%d манифестов)\n", projectID, len(manifests))
	return nil
}

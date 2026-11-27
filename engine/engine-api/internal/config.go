package engineapi

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"path"
	"regexp"
	"strings"
)

var (
	lowerDNSName = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$`)
	ipv4Pattern  = regexp.MustCompile(`^[0-9]+(\.[0-9]+){3}$`)
	envName      = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

type projectConfig struct {
	Hostname   string                   `json:"hostname"`
	Services   map[string]serviceConfig `json:"services"`
	PostgreSQL struct {
		Enabled bool `json:"enabled"`
	} `json:"postgresql"`
	Env     map[string]*string `json:"env"`
	Secrets map[string]*string `json:"secrets"`
}

type serviceConfig struct {
	Dockerfile string `json:"dockerfile"`
	Context    string `json:"context"`
	Port       *int   `json:"port"`
}

func normalizeConfig(c *projectConfig) error {
	if c == nil {
		return errors.New("config is required")
	}
	if len(c.Hostname) > 253 || !strings.Contains(c.Hostname, ".") ||
		!asciiDNSName(c.Hostname) || ipv4Pattern.MatchString(c.Hostname) {
		return errors.New("config.hostname must be an ASCII DNS hostname")
	}
	c.Hostname = strings.ToLower(c.Hostname)
	if len(c.Services) == 0 {
		return errors.New("config.services must contain frontend or backend")
	}
	for name, service := range c.Services {
		var defaultPort int
		switch name {
		case "frontend":
			defaultPort = 80
		case "backend":
			defaultPort = 8000
		default:
			return errors.New("config.services must contain only frontend and backend")
		}
		if !repositoryPath(service.Dockerfile) || path.Clean(service.Dockerfile) == "." {
			return errors.New("dockerfile must be a relative file path inside the repository")
		}
		service.Dockerfile = path.Clean(service.Dockerfile)
		if service.Context == "" {
			service.Context = path.Dir(service.Dockerfile)
		} else if !repositoryPath(service.Context) {
			return errors.New("context must be a relative directory path inside the repository")
		}
		service.Context = path.Clean(service.Context)
		if service.Port == nil {
			service.Port = &defaultPort
		} else if *service.Port < 1 || *service.Port > 65535 {
			return errors.New("service port must be between 1 and 65535")
		}
		c.Services[name] = service
	}
	for name, value := range c.Env {
		if !envName.MatchString(name) || value == nil || strings.ContainsRune(*value, 0) {
			return errors.New("config.env contains an invalid variable")
		}
		if _, exists := c.Secrets[name]; exists {
			return errors.New("config.env and config.secrets cannot share variable names")
		}
	}
	for name, value := range c.Secrets {
		if !envName.MatchString(name) || value == nil || !sealedValue(*value) {
			return errors.New("config.secrets must contain named Sealed Secrets ciphertexts")
		}
	}
	if c.Env == nil {
		c.Env = map[string]*string{}
	}
	if c.Secrets == nil {
		c.Secrets = map[string]*string{}
	}
	return nil
}

func asciiDNSName(name string) bool {
	for _, c := range name {
		if c > 127 {
			return false
		}
	}
	return lowerDNSName.MatchString(strings.ToLower(name))
}

func repositoryPath(value string) bool {
	if strings.TrimSpace(value) == "" || path.IsAbs(value) || strings.ContainsAny(value, "\\:") {
		return false
	}
	for _, c := range value {
		if c < 32 || c == 127 {
			return false
		}
	}
	for _, component := range strings.Split(value, "/") {
		if component == ".." {
			return false
		}
	}
	return true
}

func sealedValue(value string) bool {
	if strings.ContainsAny(value, "\r\n") {
		return false
	}
	data, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || len(data) < 2 {
		return false
	}
	// Проверяем структуру конверта Sealed Secrets без расшифровки.
	keySize := int(binary.BigEndian.Uint16(data))
	return keySize >= 128 && len(data) >= 2+keySize+16
}

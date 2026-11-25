package manifestgenerator

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"slices"
	"strings"

	"gopkg.in/yaml.v3"
)

type ReleaseSpec struct {
	Project       ProjectSpec                 `yaml:"project"`
	Services      map[string]ServiceSpec      `yaml:"services"`
	Routes        []RouteSpec                 `yaml:"routes"`
	Gateway       GatewaySpec                 `yaml:"gateway"`
	PostgreSQL    *PostgreSQLSpec             `yaml:"postgresql,omitempty"`
	SealedSecrets map[string]SealedSecretSpec `yaml:"sealedSecrets,omitempty"`
}

type ProjectSpec struct {
	ID             string `yaml:"id"`
	Hostname       string `yaml:"hostname"`
	SourceSHA      string `yaml:"sourceSHA"`
	ConfigRevision string `yaml:"configRevision"`
}

type ServiceSpec struct {
	Image          string                  `yaml:"image"`
	Replicas       int                     `yaml:"replicas"`
	Port           *int                    `yaml:"port,omitempty"`
	Resources      Resources               `yaml:"resources"`
	Env            map[string]string       `yaml:"env,omitempty"`
	SecretEnv      map[string]SecretKeyRef `yaml:"secretEnv,omitempty"`
	ReadinessProbe *ReadinessProbe         `yaml:"readinessProbe,omitempty"`
}

type PostgreSQLSpec struct {
	Image                string       `yaml:"image"`
	Database             string       `yaml:"database"`
	User                 string       `yaml:"user"`
	PasswordSecretKeyRef SecretKeyRef `yaml:"passwordSecretKeyRef"`
	StorageSize          string       `yaml:"storageSize"`
	StorageClass         string       `yaml:"storageClass"`
	Resources            Resources    `yaml:"resources"`
}

type SealedSecretSpec struct {
	EncryptedData map[string]string `yaml:"encryptedData"`
}

type SecretKeyRef struct {
	Name string `yaml:"name"`
	Key  string `yaml:"key"`
}

type Resources struct {
	Requests ResourceList `yaml:"requests"`
	Limits   ResourceList `yaml:"limits"`
}

type ResourceList struct {
	CPU    string `yaml:"cpu"`
	Memory string `yaml:"memory"`
}

type RouteSpec struct {
	Path    string `yaml:"path"`
	Service string `yaml:"service"`
}

type GatewaySpec struct {
	Name      string `yaml:"name,omitempty"`
	Namespace string `yaml:"namespace,omitempty"`
}

type ReadinessProbe struct {
	HTTPGet             *HTTPGetProbe   `yaml:"httpGet,omitempty"`
	TCPSocket           *TCPSocketProbe `yaml:"tcpSocket,omitempty"`
	GRPC                *GRPCProbe      `yaml:"grpc,omitempty"`
	Exec                *ExecProbe      `yaml:"exec,omitempty"`
	InitialDelaySeconds *int            `yaml:"initialDelaySeconds,omitempty"`
	PeriodSeconds       *int            `yaml:"periodSeconds,omitempty"`
	TimeoutSeconds      *int            `yaml:"timeoutSeconds,omitempty"`
	FailureThreshold    *int            `yaml:"failureThreshold,omitempty"`
	SuccessThreshold    *int            `yaml:"successThreshold,omitempty"`
}

type HTTPGetProbe struct {
	Port        int          `yaml:"port"`
	Path        string       `yaml:"path,omitempty"`
	Scheme      string       `yaml:"scheme,omitempty"`
	HTTPHeaders []HTTPHeader `yaml:"httpHeaders,omitempty"`
}

type HTTPHeader struct {
	Name  string `yaml:"name"`
	Value string `yaml:"value"`
}

type TCPSocketProbe struct {
	Port int `yaml:"port"`
}

type GRPCProbe struct {
	Port    int    `yaml:"port"`
	Service string `yaml:"service,omitempty"`
}

type ExecProbe struct {
	Command []string `yaml:"command"`
}

// BuildValues проверяет обязательные данные релиза и кодирует его как Helm values.
func BuildValues(spec ReleaseSpec) ([]byte, error) {
	switch {
	case strings.TrimSpace(spec.Project.ID) == "":
		return nil, errors.New("project.id is required")
	case strings.TrimSpace(spec.Project.Hostname) == "":
		return nil, errors.New("project.hostname is required")
	case strings.TrimSpace(spec.Project.SourceSHA) == "":
		return nil, errors.New("project.sourceSHA is required")
	case strings.TrimSpace(spec.Project.ConfigRevision) == "":
		return nil, errors.New("project.configRevision is required")
	case len(spec.Services) == 0:
		return nil, errors.New("at least one service is required")
	}

	names := make([]string, 0, len(spec.Services))
	for name := range spec.Services {
		names = append(names, name)
	}
	slices.Sort(names)
	for _, name := range names {
		service := spec.Services[name]
		switch {
		case strings.TrimSpace(name) == "":
			return nil, errors.New("service name is required")
		case strings.TrimSpace(service.Image) == "":
			return nil, fmt.Errorf("service %q: image is required", name)
		case strings.TrimSpace(service.Resources.Requests.CPU) == "" || strings.TrimSpace(service.Resources.Requests.Memory) == "":
			return nil, fmt.Errorf("service %q: resource requests require cpu and memory", name)
		case strings.TrimSpace(service.Resources.Limits.CPU) == "" || strings.TrimSpace(service.Resources.Limits.Memory) == "":
			return nil, fmt.Errorf("service %q: resource limits require cpu and memory", name)
		}
	}
	for i, route := range spec.Routes {
		if strings.TrimSpace(route.Path) == "" || strings.TrimSpace(route.Service) == "" {
			return nil, fmt.Errorf("route %d: path and service are required", i+1)
		}
	}
	if len(spec.Routes) != 0 && (strings.TrimSpace(spec.Gateway.Name) == "" || strings.TrimSpace(spec.Gateway.Namespace) == "") {
		return nil, errors.New("gateway.name and gateway.namespace are required when routes are present")
	}
	for name, secret := range spec.SealedSecrets {
		if len(secret.EncryptedData) == 0 {
			return nil, fmt.Errorf("sealed secret %q: encryptedData is required", name)
		}
		for key, value := range secret.EncryptedData {
			if !isSealedValue(value) {
				return nil, fmt.Errorf("sealed secret %q key %q: expected a Sealed Secrets ciphertext", name, key)
			}
		}
	}

	return yaml.Marshal(spec)
}

func isSealedValue(value string) bool {
	data, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || len(data) < 2 {
		return false
	}
	// Sealed Secrets prefixes the RSA-wrapped key with its length and appends a GCM tag.
	keySize := int(binary.BigEndian.Uint16(data))
	return keySize >= 128 && len(data) >= 2+keySize+16
}

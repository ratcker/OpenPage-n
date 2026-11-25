{{- define "openpage-app.serviceName" -}}
{{- $identity := printf "%s/%s" (.projectID | lower) .service -}}
{{- printf "%s-%s" (.service | trunc 50 | trimSuffix "-") ($identity | sha256sum | trunc 12) -}}
{{- end -}}

{{- define "openpage-app.selectorLabels" -}}
app.kubernetes.io/name: {{ .service | quote }}
openpage/project-id: {{ .projectID | lower | quote }}
{{- end -}}

{{- define "openpage-app.secretKeyRef" -}}
{{- $secret := get .secrets .ref.name | default dict -}}
{{- if not (hasKey ($secret.encryptedData | default dict) .ref.key) -}}
  {{- fail (printf "secretKeyRef %q requires key %q in sealedSecrets" .ref.name .ref.key) -}}
{{- end -}}
name: {{ .ref.name | quote }}
key: {{ .ref.key | quote }}
{{- end -}}

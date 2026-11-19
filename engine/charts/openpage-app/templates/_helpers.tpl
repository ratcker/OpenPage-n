{{- define "openpage-app.serviceName" -}}
{{- $identity := printf "%s/%s" (.projectID | lower) .service -}}
{{- printf "%s-%s" (.service | trunc 50 | trimSuffix "-") ($identity | sha256sum | trunc 12) -}}
{{- end -}}

{{- define "openpage-app.selectorLabels" -}}
app.kubernetes.io/name: {{ .service | quote }}
openpage/project-id: {{ .projectID | lower | quote }}
{{- end -}}

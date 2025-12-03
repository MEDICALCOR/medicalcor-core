{{/*
============================================================================
OSAX Helm Chart Helper Templates
============================================================================
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "osax.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "osax.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "osax.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "osax.labels" -}}
helm.sh/chart: {{ include "osax.chart" . }}
{{ include "osax.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: medicalcor
environment: {{ .Values.global.environment | default "production" }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "osax.selectorLabels" -}}
app.kubernetes.io/name: {{ include "osax.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "osax.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "osax.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Database connection string
*/}}
{{- define "osax.databaseUrl" -}}
{{- if .Values.database.existingSecret }}
valueFrom:
  secretKeyRef:
    name: {{ .Values.database.existingSecret }}
    key: {{ .Values.database.existingSecretKey | default "DATABASE_URL" }}
{{- else }}
value: {{ .Values.database.url | quote }}
{{- end }}
{{- end }}

{{/*
Redis connection string
*/}}
{{- define "osax.redisUrl" -}}
{{- if .Values.redis.existingSecret }}
valueFrom:
  secretKeyRef:
    name: {{ .Values.redis.existingSecret }}
    key: {{ .Values.redis.existingSecretKey | default "REDIS_URL" }}
{{- else }}
value: {{ .Values.redis.url | quote }}
{{- end }}
{{- end }}

{{/*
Pod annotations for Prometheus scraping (fallback if ServiceMonitor not used)
*/}}
{{- define "osax.podAnnotations" -}}
{{- if .Values.monitoring.prometheus.enabled }}
prometheus.io/scrape: "true"
prometheus.io/port: {{ .Values.monitoring.prometheus.port | default 9090 | quote }}
prometheus.io/path: {{ .Values.monitoring.prometheus.path | default "/metrics" | quote }}
{{- end }}
{{- with .Values.podAnnotations }}
{{- toYaml . }}
{{- end }}
{{- end }}

{{/*
Container security context (HIPAA compliant defaults)
*/}}
{{- define "osax.containerSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ .Values.security.podSecurityPolicy.runAsUser | default 1000 }}
runAsGroup: {{ .Values.security.podSecurityPolicy.runAsGroup | default 1000 }}
readOnlyRootFilesystem: {{ .Values.security.podSecurityPolicy.readOnlyRootFilesystem | default true }}
allowPrivilegeEscalation: {{ .Values.security.podSecurityPolicy.allowPrivilegeEscalation | default false }}
capabilities:
  drop:
    - ALL
{{- end }}

{{/*
Pod security context
*/}}
{{- define "osax.podSecurityContext" -}}
fsGroup: {{ .Values.security.podSecurityPolicy.fsGroup | default 1000 }}
seccompProfile:
  type: RuntimeDefault
{{- end }}

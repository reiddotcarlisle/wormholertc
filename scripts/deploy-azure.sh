#!/usr/bin/env bash
set -euo pipefail

# Idempotent Azure deployment script for this Node.js server.
# Creates missing resources and updates existing ones.

SCRIPT_NAME="$(basename "$0")"

usage() {
  cat <<EOF
Usage:
  $SCRIPT_NAME \
    --resource-group <name> \
    --location <azure-region> \
    --plan <app-service-plan-name> \
    --app <webapp-name> \
    [--sku <B1|S1|P1v3...>] \
    [--runtime <NODE:20-lts>] \
    [--port <8001>] \
    [--startup-file <node server.js>] \
    [--subscription <subscription-id-or-name>] \
    [--dry-run]

Example:
  $SCRIPT_NAME \
    --resource-group rg-wormhole-rtc \
    --location eastus \
    --plan plan-wormhole-rtc \
    --app wormhole-rtc-12345 \
    --sku B1
EOF
}

log() {
  printf "[deploy] %s\n" "$*"
}

err() {
  printf "[deploy][error] %s\n" "$*" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "Missing required command: $1"
    exit 1
  }
}

RESOURCE_GROUP=""
LOCATION=""
PLAN_NAME=""
APP_NAME=""
SKU="B1"
RUNTIME="NODE:20-lts"
PORT="8001"
STARTUP_FILE="node server.js"
SUBSCRIPTION=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group)
      RESOURCE_GROUP="$2"; shift 2 ;;
    --location)
      LOCATION="$2"; shift 2 ;;
    --plan)
      PLAN_NAME="$2"; shift 2 ;;
    --app)
      APP_NAME="$2"; shift 2 ;;
    --sku)
      SKU="$2"; shift 2 ;;
    --runtime)
      RUNTIME="$2"; shift 2 ;;
    --port)
      PORT="$2"; shift 2 ;;
    --startup-file)
      STARTUP_FILE="$2"; shift 2 ;;
    --subscription)
      SUBSCRIPTION="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN="true"; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      err "Unknown argument: $1"
      usage
      exit 1 ;;
  esac
done

if [[ -z "$RESOURCE_GROUP" || -z "$LOCATION" || -z "$PLAN_NAME" || -z "$APP_NAME" ]]; then
  err "Missing required arguments."
  usage
  exit 1
fi

require_cmd az
require_cmd zip

if [[ "$DRY_RUN" == "true" ]]; then
  log "Dry run enabled: no changes will be applied."
fi

# Ensure we're at repo root (script may be run from anywhere).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "$SUBSCRIPTION" ]]; then
  log "Setting Azure subscription: $SUBSCRIPTION"
  az account set --subscription "$SUBSCRIPTION"
fi

log "Validating Azure login context"
if ! az account show >/dev/null 2>&1; then
  err "Not logged in to Azure CLI. Run: az login"
  exit 1
fi

run_or_echo() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf "[dry-run] %s\n" "$*"
  else
    eval "$*"
  fi
}

resource_group_exists() {
  az group exists --name "$RESOURCE_GROUP"
}

plan_exists() {
  az appservice plan show --name "$PLAN_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1
}

webapp_exists() {
  az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1
}

log "Ensuring resource group exists"
if [[ "$(resource_group_exists)" != "true" ]]; then
  run_or_echo "az group create --name '$RESOURCE_GROUP' --location '$LOCATION' >/dev/null"
  log "Created resource group: $RESOURCE_GROUP"
else
  log "Resource group exists: $RESOURCE_GROUP"
fi

log "Ensuring App Service plan exists"
if ! plan_exists; then
  run_or_echo "az appservice plan create --name '$PLAN_NAME' --resource-group '$RESOURCE_GROUP' --sku '$SKU' --is-linux >/dev/null"
  log "Created App Service plan: $PLAN_NAME"
else
  log "App Service plan exists: $PLAN_NAME"
fi

log "Ensuring web app exists"
if ! webapp_exists; then
  run_or_echo "az webapp create --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --plan '$PLAN_NAME' --runtime '$RUNTIME' >/dev/null"
  log "Created web app: $APP_NAME"
else
  log "Web app exists: $APP_NAME"
  run_or_echo "az webapp config set --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --linux-fx-version '$RUNTIME' >/dev/null"
fi

log "Applying app configuration"
run_or_echo "az webapp config set --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --startup-file '$STARTUP_FILE' --web-sockets-enabled true >/dev/null"

# Keep runtime behavior explicit for this codebase (server.js currently binds to a fixed port by default).
run_or_echo "az webapp config appsettings set --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --settings NODE_ENV=production SCM_DO_BUILD_DURING_DEPLOYMENT=true WEBSITE_RUN_FROM_PACKAGE=1 PORT='$PORT' WEBSITES_PORT='$PORT' >/dev/null"

PACKAGE_FILE="/tmp/${APP_NAME}-$(date +%Y%m%d%H%M%S).zip"

log "Building deployment package: $PACKAGE_FILE"
if [[ "$DRY_RUN" == "true" ]]; then
  printf "[dry-run] zip -r '%s' . -x '.git/*' 'node_modules/*' '.vscode/*' '*.log'\n" "$PACKAGE_FILE"
else
  rm -f "$PACKAGE_FILE"
  zip -r "$PACKAGE_FILE" . \
    -x ".git/*" \
       "node_modules/*" \
       ".vscode/*" \
       "*.log" \
       "*.tmp" \
       "coverage/*" \
       ".DS_Store" >/dev/null
fi

log "Deploying package (idempotent update)"
# Prefer modern deploy command; fallback to config-zip for older az versions.
if az webapp deploy -h >/dev/null 2>&1; then
  run_or_echo "az webapp deploy --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --src-path '$PACKAGE_FILE' --type zip --restart true --clean false >/dev/null"
else
  run_or_echo "az webapp deployment source config-zip --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' --src '$PACKAGE_FILE' >/dev/null"
fi

log "Restarting web app"
run_or_echo "az webapp restart --name '$APP_NAME' --resource-group '$RESOURCE_GROUP' >/dev/null"

APP_URL="https://${APP_NAME}.azurewebsites.net"
log "Deployment complete"
log "App URL: $APP_URL"
log "Health endpoints: $APP_URL/ and $APP_URL/status and $APP_URL/api/status"

if [[ "$DRY_RUN" != "true" ]]; then
  log "Done."
fi

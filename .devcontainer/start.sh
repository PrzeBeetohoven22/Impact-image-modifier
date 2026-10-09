#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ -z "${CODESPACE_NAME:-}" ]]; then
  printf 'To polecenie służy do GitHub Codespaces. Lokalnie użyj npm start.\n' >&2
  exit 1
fi
if [[ ! -f dist/server/index.js || ! -f dist/client/index.html ]]; then
  printf 'Najpierw wykonaj: bash .devcontainer/setup.sh\n' >&2
  exit 1
fi
export HOST=0.0.0.0
export PORT=3001
export APP_ORIGIN="https://${CODESPACE_NAME}-3001.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
exec node dist/server/index.js

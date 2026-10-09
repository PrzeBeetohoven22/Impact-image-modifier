#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node -e 'if (process.versions.node.split(".")[0] !== "24") { console.error("Wymagany Node.js 24. Sprawdź, czy w repozytorium jest folder .devcontainer, i przebuduj kontener Codespaces."); process.exit(1); }'
npm_config_onnxruntime_node_install_cuda=skip npm ci --include=dev --no-audit --no-fund
if ! npm run setup:objects; then
  printf '\nNie pobrano dodatkowego modelu mikrofonów. Aplikacja uruchomi się z podstawowym wykrywaniem przedmiotów. Ponów: npm run setup:objects\n'
fi
npm run build
printf '\nGotowe. Aby uruchomić aplikację, wpisz: bash .devcontainer/start.sh\n'

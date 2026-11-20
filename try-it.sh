#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "Installing dependencies with pnpm..."
  pnpm install
fi

echo "Validating theorem corpus and Agent Lens receipts..."
pnpm validate

echo "Starting TheoremSurvival on http://localhost:5180 ..."
exec pnpm dev

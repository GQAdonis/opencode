#!/usr/bin/env bash
# Fork build helper: builds the V2 CLI (opencode2) with an accurate fork version.
#
# Upstream derives the build version from an npm lookup, which yields a placeholder like
# 0.0.0-v2-<timestamp> on the v2 line (upstream has not stamped a 2.0). The build already
# honors OPENCODE_VERSION (see packages/script/src/index.ts), so this helper sets it to
# 2.0.0-dev by default -- no upstream file is modified.
#
# Usage:
#   ./scripts/build-cli.sh                 # builds opencode2 as 2.0.0-dev
#   OPENCODE_VERSION=2.1.0-dev ./scripts/build-cli.sh   # override the version
#
# The built binary lands at packages/cli/dist/cli-<target>/bin/opencode2.
set -euo pipefail
cd "$(dirname "$0")/.."
export OPENCODE_VERSION="${OPENCODE_VERSION:-2.0.0-dev}"
echo "Building opencode2 as version ${OPENCODE_VERSION} ..."
bun run --cwd packages/cli build --single "$@"
BIN="$(find packages/cli/dist -name opencode2 -type f | head -1)"
echo "Built: ${BIN}"
"${BIN}" --version

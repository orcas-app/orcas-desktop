#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Setting up bd (beads issue tracker)..."

# Try binary download first, fall back to npm
if ! command -v bd &> /dev/null; then
    # Preferred: download pre-built binary (works in Claude Code Web)
    echo "Trying binary download..."
    BD_PATH="${HOME}/.local/bin/bd"
    mkdir -p "$(dirname "$BD_PATH")"
    if curl -fsSL https://raw.githubusercontent.com/btucker/bd-binaries/main/linux_amd64/bd -o "$BD_PATH" 2>/dev/null; then
        chmod +x "$BD_PATH"
        export PATH="${HOME}/.local/bin:$PATH"
        echo "Installed via binary download"
    elif npm install -g @beads/bd --quiet 2>/dev/null && command -v bd &> /dev/null; then
        echo "Installed via npm"
    else
        echo "Warning: failed to install bd"
    fi
fi

# Persist PATH so bd is available throughout the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"${HOME}/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Verify and show version
bd version

echo "Installing npm dependencies..."
# CLAUDE_PROJECT_DIR may not be set in all environments; fall back to the
# project root derived from this script's location (.claude/hooks/session-start.sh → ../../)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
npm install --prefix "$PROJECT_DIR"
echo "npm install complete"

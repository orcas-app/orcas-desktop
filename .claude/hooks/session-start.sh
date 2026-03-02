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

# Install dolt (required by bd)
if ! command -v dolt &> /dev/null; then
    echo "Installing dolt..."
    DOLT_VERSION="1.83.0"
    DOLT_URL="https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-amd64.tar.gz"
    DOLT_BIN="${HOME}/.local/bin/dolt"
    mkdir -p "$(dirname "$DOLT_BIN")"
    if curl -fsSL "$DOLT_URL" -o /tmp/dolt.tar.gz 2>/dev/null && \
       tar -xzf /tmp/dolt.tar.gz -C /tmp/ 2>/dev/null; then
        cp /tmp/dolt-linux-amd64/bin/dolt "$DOLT_BIN"
        chmod +x "$DOLT_BIN"
        export PATH="${HOME}/.local/bin:$PATH"
        echo "Installed dolt v${DOLT_VERSION}"
    else
        echo "Warning: failed to install dolt"
    fi
fi

# Persist PATH so bd and dolt are available throughout the session
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

#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Setting up bd (beads issue tracker)..."

# Try npm first, fall back to binary download
if ! command -v bd &> /dev/null; then
    if npm install -g @beads/bd --quiet 2>/dev/null && command -v bd &> /dev/null; then
        echo "Installed via npm"
    else
        # Fallback: download pre-built binary (works in Claude Code Web)
        echo "Trying binary download fallback..."
        BD_PATH="${HOME}/.local/bin/bd"
        mkdir -p "$(dirname "$BD_PATH")"
        curl -fsSL https://raw.githubusercontent.com/btucker/bd-binaries/main/linux_amd64/bd -o "$BD_PATH"
        chmod +x "$BD_PATH"
        export PATH="${HOME}/.local/bin:$PATH"
        echo "Installed via binary download"
    fi
fi

# Persist PATH so bd is available throughout the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"${HOME}/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Verify and show version
bd version

echo "Installing npm dependencies..."
npm install --prefix "$CLAUDE_PROJECT_DIR"
echo "npm install complete"

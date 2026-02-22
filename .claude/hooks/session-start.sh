#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Setting up bd (beads issue tracker)..."

# bd v0.52.0+ dropped SQLite/JSONL support and requires Dolt (CGO).
# The pre-built linux binary lacks CGO support, so we pin to v0.50.3
# which supports SQLite without CGO. This commit SHA is stable.
BD_COMPAT_COMMIT="19425c9708"
BD_COMPAT_VERSION="0.50.3"

install_bd_binary() {
    BD_PATH="${HOME}/.local/bin/bd"
    mkdir -p "$(dirname "$BD_PATH")"
    curl -fsSL "https://raw.githubusercontent.com/btucker/bd-binaries/${BD_COMPAT_COMMIT}/linux_amd64/bd" -o "$BD_PATH"
    chmod +x "$BD_PATH"
    export PATH="${HOME}/.local/bin:$PATH"
}

if ! command -v bd &> /dev/null; then
    echo "Downloading bd v${BD_COMPAT_VERSION} (SQLite-compatible)..."
    install_bd_binary
    echo "Installed via binary download"
else
    # Verify the installed binary actually works (v0.52.0 breaks without CGO)
    INSTALLED_VER=$(bd version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1 || echo "0.0.0")
    MAJOR=$(echo "$INSTALLED_VER" | cut -d. -f1)
    MINOR=$(echo "$INSTALLED_VER" | cut -d. -f2)
    # Downgrade if version >= 0.51.0 (Dolt-only, no CGO)
    if [ "$MAJOR" -gt 0 ] || [ "$MINOR" -ge 51 ]; then
        echo "bd v${INSTALLED_VER} requires Dolt/CGO (not available). Downgrading to v${BD_COMPAT_VERSION}..."
        install_bd_binary
        echo "Replaced with compatible bd v${BD_COMPAT_VERSION}"
    fi
fi

# Persist PATH so bd is available throughout the session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"${HOME}/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Verify and show version
bd version

# Initialize bd database if not already done
BD_BEADS_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}/.beads"
if [ -d "$BD_BEADS_DIR" ]; then
    export BEADS_DIR="$BD_BEADS_DIR"
    # Initialize if no database exists yet; auto-falls back to JSONL/SQLite (no CGO needed)
    if ! bd list &>/dev/null; then
        echo "Initializing bd database..."
        bd init --prefix orcas-desktop --skip-hooks 2>/dev/null || true
        # Ensure issue prefix is configured (needed for create/update commands)
        bd config set issue-prefix orcas-desktop 2>/dev/null || true
        bd config set issue_prefix orcas-desktop 2>/dev/null || true
    fi
    echo "bd ready: $(bd status --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(f\"{d[\"total\"]} issues ({d[\"open\"]} open)\")' 2>/dev/null || echo 'OK')"
fi

echo "Installing npm dependencies..."
# CLAUDE_PROJECT_DIR may not be set in all environments; fall back to the
# project root derived from this script's location (.claude/hooks/session-start.sh → ../../)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
npm install --prefix "$PROJECT_DIR"
echo "npm install complete"

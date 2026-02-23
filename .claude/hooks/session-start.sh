#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Setting up bd (beads issue tracker)..."

# --- bd installation ---
# Try npm first, fall back to official binary install script
if ! command -v bd &> /dev/null || ! bd --version 2>/dev/null | grep -q "0\.[5-9][0-9]\|[1-9]"; then
    if npm install -g @beads/bd --quiet 2>/dev/null && command -v bd &> /dev/null; then
        echo "Installed bd via npm"
    else
        echo "Installing bd via official install script..."
        curl -fsSL https://raw.githubusercontent.com/steveyegge/beads/main/scripts/install.sh | bash 2>/dev/null || true
    fi
fi

# Prefer /usr/local/bin so the freshly installed bd takes precedence over
# any older binary that may exist at ~/.local/bin
export PATH="/usr/local/bin:${HOME}/.local/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo "export PATH=\"/usr/local/bin:${HOME}/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Verify and show version
bd version

# --- Dolt installation ---
if ! command -v dolt &> /dev/null; then
    echo "Installing Dolt database engine..."
    curl -fsSL https://github.com/dolthub/dolt/releases/latest/download/install.sh | bash
fi

# Configure dolt global identity (required for dolt init / commits)
if ! dolt config --global --get user.email &> /dev/null 2>&1; then
    dolt config --global --add user.email "bd@orcas.dev"
    dolt config --global --add user.name "Beads"
fi

# --- Dolt SQL server ---
DOLT_DIR="${HOME}/.beads-dolt"

# Create and init the dolt repo directory if this is a fresh environment
if [ ! -d "${DOLT_DIR}/.dolt" ]; then
    echo "Initializing Dolt repository at ${DOLT_DIR}..."
    mkdir -p "${DOLT_DIR}"
    (cd "${DOLT_DIR}" && dolt init)
fi

# Start the server only if it isn't already listening on port 3307
if ! nc -z 127.0.0.1 3307 2>/dev/null; then
    echo "Starting Dolt SQL server on port 3307..."
    (cd "${DOLT_DIR}" && dolt sql-server --port 3307 >> /tmp/dolt-server.log 2>&1) &

    # Wait up to 10 s for the server to accept connections
    for i in 1 2 3 4 5 6 7 8 9 10; do
        sleep 1
        if nc -z 127.0.0.1 3307 2>/dev/null; then
            echo "Dolt SQL server ready"
            break
        fi
        if [ "$i" -eq 10 ]; then
            echo "WARNING: Dolt SQL server did not start in time; bd commands may fail" >&2
        fi
    done
else
    echo "Dolt SQL server already running"
fi

# --- beads database init ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# Initialise only when the .beads/dolt marker directory is missing or empty
BEADS_DOLT_DIR="${PROJECT_DIR}/.beads/dolt"
if [ ! -d "${BEADS_DOLT_DIR}" ] || [ -z "$(ls -A "${BEADS_DOLT_DIR}" 2>/dev/null)" ]; then
    echo "Initializing beads database..."
    # Remove any empty placeholder directory left by a previous failed init
    rm -rf "${BEADS_DOLT_DIR}"
    (cd "${PROJECT_DIR}" && bd init -p orcas --skip-hooks --quiet) || true
else
    echo "Beads database already initialized"
fi

# --- npm dependencies ---
echo "Installing npm dependencies..."
npm install --prefix "$PROJECT_DIR"
echo "npm install complete"

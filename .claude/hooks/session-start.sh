#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

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

# Install dolt if not present
if ! command -v dolt &> /dev/null; then
    echo "Installing dolt..."
    DOLT_VERSION="1.82.4"
    curl -fsSL "https://github.com/dolthub/dolt/releases/download/v${DOLT_VERSION}/dolt-linux-amd64.tar.gz" -o /tmp/dolt.tar.gz
    tar -xzf /tmp/dolt.tar.gz -C /tmp
    cp /tmp/dolt-linux-amd64/bin/dolt "${HOME}/.local/bin/dolt"
    chmod +x "${HOME}/.local/bin/dolt"
    rm -rf /tmp/dolt.tar.gz /tmp/dolt-linux-amd64
    echo "dolt installed: $(dolt version)"
else
    echo "dolt already installed: $(dolt version)"
fi

# Start dolt sql-server if not already running
DOLT_DATA_DIR="${HOME}/.dolt-server"
DOLT_PORT=3307

if ! nc -z 127.0.0.1 "$DOLT_PORT" 2>/dev/null; then
    echo "Starting dolt sql-server on port ${DOLT_PORT}..."
    mkdir -p "$DOLT_DATA_DIR"
    # Initialize dolt repo if needed
    if [ ! -d "${DOLT_DATA_DIR}/.dolt" ]; then
        cd "$DOLT_DATA_DIR" && dolt init --name "beads" --email "beads@localhost"
    fi
    cd "$DOLT_DATA_DIR" && dolt sql-server --port="$DOLT_PORT" --loglevel=warning >/dev/null 2>&1 &
    # Wait for server to be ready (up to 10s)
    for i in $(seq 1 10); do
        if nc -z 127.0.0.1 "$DOLT_PORT" 2>/dev/null; then
            echo "dolt sql-server ready"
            break
        fi
        sleep 1
    done
else
    echo "dolt sql-server already running on port ${DOLT_PORT}"
fi

# Initialize bd database schema if not yet set up (first run in a fresh container)
if ! bd list >/dev/null 2>&1; then
    echo "Initializing bd database schema..."
    cd "$PROJECT_DIR" && bd init --force 2>&1 | grep -v "^$" || true
fi

echo "Installing npm dependencies..."
npm install --prefix "$PROJECT_DIR"
echo "npm install complete"

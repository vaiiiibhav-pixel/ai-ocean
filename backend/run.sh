#!/usr/bin/env bash
# Convenience runner: installs deps if missing, then starts the app.
set -e
cd "$(dirname "$0")"
python3 -c "import flask" 2>/dev/null || pip install -r requirements.txt
PORT="${PORT:-8000}" python3 -m app.main

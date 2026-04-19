#!/bin/sh
# Ditto — Container entrypoint
#
# Runs as root on startup, then drops privileges to the `ditto` user.
# The chown step is essential: Railway/Fly volumes arrive owned by root:root,
# which blocks the non-root runtime user from opening the SQLite database
# (SQLITE_CANTOPEN). We chown the data dir to ditto before exec'ing the app.

set -e

# Resolve the SQLite data directory. Prefer DATABASE_PATH when set so the
# entrypoint fixes permissions on whatever path the app will actually open.
DB_PATH="${DATABASE_PATH:-/app/data/ditto.db}"
DB_DIR="$(dirname "$DB_PATH")"

if [ ! -d "$DB_DIR" ]; then
  mkdir -p "$DB_DIR"
fi
chown -R ditto:ditto "$DB_DIR" 2>/dev/null || true

exec su-exec ditto:ditto "$@"

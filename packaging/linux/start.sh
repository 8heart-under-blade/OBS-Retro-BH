#!/bin/sh
set -e

case "$0" in /*) launcher=$0 ;; *) launcher=./$0 ;; esac
SCRIPT_DIR="$(CDPATH='' cd "$(dirname "$launcher")" && pwd -P)"

# In bundle: start.sh is at bundle root; runtime/node and app/ are siblings
NODE_BIN="$SCRIPT_DIR/runtime/node"
PORTABLE_ENTRY="$SCRIPT_DIR/app/scripts/portable.mjs"

if [ ! -f "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "Bundled Node is missing or not executable: $NODE_BIN. Re-extract the original tarball with permissions intact." >&2
  exit 1
fi

if [ ! -f "$PORTABLE_ENTRY" ]; then
  echo "Portable entry not found at: $PORTABLE_ENTRY" >&2
  exit 1
fi

exec "$NODE_BIN" "$PORTABLE_ENTRY" "$@"

#!/bin/sh
set -eu
cd "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Install Node.js 22+ from https://nodejs.org, then rerun ./install.sh.' >&2; exit 1; }
node scripts/install-host.mjs "$@"

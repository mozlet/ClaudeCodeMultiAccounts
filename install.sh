#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'install.sh requires Node.js.' >&2
  exit 1
fi

repo_root="$(cd -- "$(dirname -- "$0")" && pwd)"
node "$repo_root/install.cjs" "$@"

user_bin_dir="$HOME/.local/bin"
if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
  install -m 755 "$user_bin_dir/cc-switch" /usr/local/bin/cc-switch
  install -m 755 "$user_bin_dir/cc-sync-oauth" /usr/local/bin/cc-sync-oauth
fi

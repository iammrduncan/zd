#!/bin/sh

set -eu

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: $0 ADR_FILE [NOTE]" >&2
  exit 64
fi

adr_file=$1
note=${2:-"Prior version before this in-place revision."}

if [ ! -f "$adr_file" ]; then
  echo "ADR file not found: $adr_file" >&2
  exit 66
fi

script_dir=$(CDPATH='' cd "$(dirname "$0")" && pwd)
git_hash=$(git -C "$script_dir" rev-parse --verify HEAD)

if grep -Fqx '## Revision history' "$adr_file"; then
  printf -- "- \`%s\` — %s\n" "$git_hash" "$note" >> "$adr_file"
else
  printf "\n## Revision history\n\n- \`%s\` — %s\n" "$git_hash" "$note" >> "$adr_file"
fi

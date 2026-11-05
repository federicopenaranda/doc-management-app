#!/bin/sh
# Writes the runtime config.json served at /config.json. Runs before nginx starts.
#   APP_CONFIG_FILE  optional: a JSON object (the mounted Secret Manager secret)
#   API_URL          optional: becomes "apiUrl" and wins over the same key in the file
# At least one of them is required. Errors name the file and never print its contents.
set -eu

out=/tmp/app-config
mkdir -p "$out"

base='{}'
if [ -n "${APP_CONFIG_FILE:-}" ]; then
  # jq's own error text can quote the input, so it is discarded.
  if ! base=$(jq -c 'if type == "object" then . else error("not an object") end' "$APP_CONFIG_FILE" 2>/dev/null); then
    echo "APP_CONFIG_FILE $APP_CONFIG_FILE is missing or is not a JSON object" >&2
    exit 1
  fi
fi

if [ -n "${API_URL:-}" ]; then
  printf '%s' "$base" | jq -c --arg url "$API_URL" '. + {apiUrl: $url}' > "$out/config.json"
elif [ "$base" != '{}' ]; then
  printf '%s\n' "$base" > "$out/config.json"
else
  echo "Set API_URL, or mount a config file and set APP_CONFIG_FILE" >&2
  exit 1
fi

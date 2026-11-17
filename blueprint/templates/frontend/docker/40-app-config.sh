#!/bin/sh
# Writes the runtime config.json served at /config.json and the security headers (nginx includes them).
# Runs before nginx starts.
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

# Security headers. The Content-Security-Policy only lets the page talk to itself, to its API (the origin of
# "apiUrl", which differs per environment) and to Google Cloud Storage (signed uploads); its inline scripts are
# allowed by the hashes computed when the image was built.
api_origin=$(jq -r '(.apiUrl // "" | capture("^(?<origin>https?://[^/]+)")? | .origin) // ""' "$out/config.json")
script_hashes=$(cat /etc/nginx/csp-script-hashes.txt)
csp="default-src 'self'; script-src 'self' $script_hashes; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' $api_origin https://storage.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
cat > "$out/security-headers.conf" <<HEADERS
add_header Content-Security-Policy "$csp" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
HEADERS

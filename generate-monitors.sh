#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="$(dirname "$0")/compose.yaml"

# Get all containers (running and stopped), output: name, ports
containers=$(docker ps -a --format '{{.Names}}|{{.Ports}}')

if [[ -z "$containers" ]]; then
  echo "No containers found." >&2
  exit 1
fi

monitors_json="["
first=true

while IFS='|' read -r name ports; do
  # Extract first host-mapped port (e.g. "0.0.0.0:8080->80/tcp" -> 8080)
  port=$(echo "$ports" | grep -oE ':[0-9]+->' | head -1 | grep -oE '[0-9]+' || true)

  if [[ -z "$port" ]]; then
    # Fallback: exposed port without host mapping
    port=$(echo "$ports" | grep -oE '[0-9]+/tcp' | head -1 | grep -oE '[0-9]+' || true)
  fi

  if [[ -z "$port" ]]; then
    echo "Skipping '$name' — no port mapping found." >&2
    continue
  fi

  entry="{\"name\": \"$name\", \"url\": \"http://localhost:$port/health\", \"interval\": 20, \"maxretries\": 2}"
  if [[ "$first" == true ]]; then
    monitors_json+=$'\n    '"$entry"
    first=false
  else
    monitors_json+=","$'\n    '"$entry"
  fi

done <<< "$containers"

monitors_json+=$'\n  ]'

if [[ "$first" == true ]]; then
  echo "No containers with port mappings found." >&2
  exit 1
fi

echo "Generated monitors JSON:"
echo "$monitors_json"
echo ""

# Pass the JSON to Python via stdin to avoid quoting/escaping issues
python3 - "$COMPOSE_FILE" <<PYEOF
import sys, re

compose_file = sys.argv[1]
monitors_json = """$monitors_json"""

with open(compose_file, "r") as f:
    content = f.read()

# Remove any existing environment block (commented or active) from the service
content = re.sub(
    r'\n[ \t]*#?[ \t]*environment:.*?(?=\n    [a-z]|\nvolumes:|\Z)',
    '',
    content,
    flags=re.DOTALL
)

# Build indented YAML block
lines = monitors_json.splitlines()
indented = "\n".join("        " + line for line in lines)
env_block = "\n    environment:\n      UPTIME_KUMA_MONITORS: |\n" + indented + "\n"

# Insert before top-level 'volumes:' key
content = content.replace("\nvolumes:", env_block + "\nvolumes:")

with open(compose_file, "w") as f:
    f.write(content)

print(f"Updated {compose_file}")
PYEOF

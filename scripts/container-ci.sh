#!/usr/bin/env bash
set -euo pipefail

image=${1:-dogfight:ci}
sha=$(git rev-parse HEAD)
container=dogfight-ci
port=3451

docker build --build-arg "BUILD_SHA=$sha" --tag "$image" .
size=$(docker image inspect --format '{{.Size}}' "$image")
printf 'Docker image size: %s bytes\n' "$size"
test "$size" -lt 200000000
test "$(docker image inspect --format '{{.Config.User}}' "$image")" = node

trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --detach --name "$container" --publish "127.0.0.1:$port:3000" \
  --env "ALLOWED_ORIGINS=http://127.0.0.1:$port" \
  --env MAX_CONNECTIONS_PER_IP=4 "$image"
CONTAINER_NAME="$container" EXPECTED_SHA="$sha" SMOKE_REPORT=container-smoke.json \
  node scripts/production-smoke.mjs
printf 'Image size: %s bytes\n' "$size" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
docker rm "$container"
docker run --detach --name "$container" --publish "127.0.0.1:$port:3000" \
  --env "ALLOWED_ORIGINS=http://127.0.0.1:$port" \
  --env MAX_CONNECTIONS_PER_IP=128 --env MAX_PLAYERS_PER_ROOM=128 "$image"
for attempt in {1..60}; do
  if curl --fail --silent "http://127.0.0.1:$port/ready" >/dev/null; then break; fi
  sleep 0.2
done
LOAD_BASE_URL="http://127.0.0.1:$port" LOAD_SECONDS=3 LOAD_REPORT=container-load.json \
  node scripts/load.mjs

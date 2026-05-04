#!/bin/bash
set -euo pipefail

COMPOSE_DIR="$HOME/texmod"
COMPOSE_FILE="docker-compose.yaml"
SERVICE="ozon-manager"
CONTAINER="ozon-manager"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
log() { echo "[$(date -Iseconds)] $*"; }

cd "$REPO_DIR"
log "Fetching origin"
git fetch --prune origin

BRANCH=$(git symbolic-ref --short HEAD)
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($LOCAL)"
    exit 0
fi

log "Pulling: $LOCAL -> $REMOTE"
git reset --hard "origin/$BRANCH"

cd "$COMPOSE_DIR"
log "Rebuilding service '$SERVICE'"
docker compose -f "$COMPOSE_FILE" up -d --build "$SERVICE"

log "Waiting for container '$CONTAINER' to run"
for i in $(seq 1 20); do
    STATE=$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    if [ "$STATE" = "running" ]; then
        log "Running after ${i}x3s"
        exit 0
    fi
    sleep 3
done

log "Container not running, last logs:"
docker logs "$CONTAINER" --tail=50
exit 1

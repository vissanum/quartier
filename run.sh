#!/bin/bash
# Runs a command inside the quartier Docker container.
#
# Usage:
#   ./run.sh node prospect/search.js "Berlin"
#   ./run.sh bash tools/validate-html.sh projects/foo/redesign
#   ./run.sh node prospect/serve.js

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="${QUARTIER_IMAGE:-quartier}"

# Build image if not available locally
if ! docker image inspect "$IMAGE_NAME" > /dev/null 2>&1; then
    echo "Image not found, building locally..."
    docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
fi

TTY_FLAG=""
[ -t 0 ] && TTY_FLAG="-it"

docker run --rm $TTY_FLAG \
    --init \
    --cap-add=SYS_ADMIN \
    -v "$SCRIPT_DIR:/app" \
    -v /dev/shm:/dev/shm \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -e HOST_WORKSPACE="$SCRIPT_DIR" \
    -p 3456:3456 \
    -p 3457:3457 \
    -w /app \
    "$IMAGE_NAME" \
    "$@"

#!/usr/bin/env bash
set -euo pipefail

IMAGE="${OPHIUSSA_IMAGE:-}"
DATA_DIR="${OPHIUSSA_DATA_DIR:-/opt/ophiussa/data}"
NAME="${OPHIUSSA_CONTAINER_NAME:-ophiussa}"
HTTP_PORT="${OPHIUSSA_HTTP_PORT:-3000}"
FTP_PORT="${OPHIUSSA_FTP_PORT:-21}"
SFTP_PORT="${OPHIUSSA_SFTP_PORT:-2022}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker first." >&2
  exit 1
fi

if [ -z "$IMAGE" ]; then
  echo "Set OPHIUSSA_IMAGE to your Docker image, e.g.:" >&2
  echo "  OPHIUSSA_IMAGE=myuser/ophiussa-server-manager:latest ./install.sh" >&2
  exit 1
fi

mkdir -p "${DATA_DIR}/servers" "${DATA_DIR}/backups" "${DATA_DIR}/logs"

echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

if docker inspect "${NAME}" >/dev/null 2>&1; then
  echo "Stopping existing container ${NAME}..."
  docker stop "${NAME}" >/dev/null || true
  docker rm "${NAME}" >/dev/null || true
fi

echo "Starting ${NAME}..."
docker run -d --name "${NAME}" --restart unless-stopped \
  -p "${HTTP_PORT}:3000" \
  -p "${FTP_PORT}:21" \
  -p "${SFTP_PORT}:2022" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "${DATA_DIR}:/data" \
  "${IMAGE}"

echo
echo "Ophiussa Server Manager is running."
echo "Open: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${HTTP_PORT}"
echo "Data: ${DATA_DIR}"
echo "Note: mounting docker.sock grants the panel root-equivalent access on this host."

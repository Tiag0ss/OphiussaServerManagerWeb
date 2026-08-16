#!/usr/bin/env bash
# Lista Dev Containers e o que ocupa as portas do painel.
set -euo pipefail

SOCK="${DOCKER_HOST:-unix:///home/tiago/.docker/desktop/docker.sock}"
if [[ "${DOCKER_HOST:-}" == "" ]] && [[ -S /home/tiago/.docker/desktop/docker.sock ]]; then
  export DOCKER_HOST="unix:///home/tiago/.docker/desktop/docker.sock"
fi

echo "=== Dev Containers ==="
if ! docker ps -a --filter 'label=devcontainer.local_folder' --format '{{.ID}}' | grep -q .; then
  echo "(nenhum)"
else
  docker ps -a --filter 'label=devcontainer.local_folder' \
    --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Label "devcontainer.local_folder"}}'
fi

echo
echo "=== Todos os contentores a correr ==="
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}'

echo
echo "=== Portas do painel no host (3000 / 2121 / 2022) ==="
for p in 3000 2121 2022; do
  line=$(ss -tlnp 2>/dev/null | grep -E ":${p}\\b" || true)
  if [[ -n "$line" ]]; then
    echo "$line"
  else
    echo ":$p livre"
  fi
done

echo
echo "Dica: se FTP/SFTP derem EADDRINUSE, no terminal do Dev Container corre:"
echo "  pkill -f 'next dev' || true"
echo "  npm run dev"

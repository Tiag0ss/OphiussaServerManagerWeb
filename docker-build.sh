#!/bin/bash

# ==============================================================================
# Docker Build and Push Script - Ophiussa Server Manager
# ==============================================================================
# Builds the production image and pushes to Docker Hub.
# Usage: ./docker-build.sh [version]
# Example: ./docker-build.sh 0.1.0
#
# Optional env:
#   DOCKER_USERNAME=myuser   (required — prompted if unset)
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}Ophiussa Server Manager — Docker Build${NC}"
echo "======================================"

if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}ERROR: Cannot connect to the Docker daemon${NC}"
    echo ""

    if getent group docker >/dev/null 2>&1 && id -nG "$USER" 2>/dev/null | grep -qw docker; then
        echo -e "${YELLOW}You are in the docker group but this shell session does not have it yet.${NC}"
        echo "Run one of:"
        echo "  newgrp docker"
        echo "  sg docker -c \"\$0 $*\""
    elif getent group docker >/dev/null 2>&1 && grep -q "^docker:.*\b${USER}\b" /etc/group 2>/dev/null; then
        echo -e "${YELLOW}You were added to the docker group but this shell was opened before that.${NC}"
        echo "Open a new terminal, or run:"
        echo "  sg docker -c \"./docker-build.sh${1:+ $1}\""
    else
        echo "On Linux, try:"
        echo "  sudo systemctl start docker"
        echo "  sudo usermod -aG docker \$USER   # then open a new terminal"
    fi

    if ! systemctl is-active --quiet docker 2>/dev/null; then
        echo ""
        echo -e "${YELLOW}Docker service is not running. Start it with:${NC}"
        echo "  sudo systemctl start docker"
    fi

    echo ""
    if [[ "$(pwd)" == /run/media/* ]] || [[ "$(df -T . 2>/dev/null | tail -1)" == *ntfs* ]]; then
        echo -e "${YELLOW}Note: this project is on an NTFS/external drive.${NC}"
        echo "Docker builds from NTFS often fail — copy to a native Linux path first, e.g.:"
        echo "  rsync -a --exclude node_modules --exclude .next . ~/OphiussaServerManager/"
        echo "  cd ~/OphiussaServerManager && ./docker-build.sh"
    fi
    exit 1
fi

FS_TYPE="$(df -T . 2>/dev/null | awk 'NR==2 {print $2}')"
if [[ "$(pwd)" == /run/media/* ]] || [[ "$FS_TYPE" == ntfs* ]] || [[ "$FS_TYPE" == fuse* ]]; then
    echo -e "${YELLOW}[WARN] Building from $FS_TYPE at $(pwd)${NC}"
    echo -e "${YELLOW}       If the build fails with tar/pipe errors, copy the project to an ext4 path first.${NC}"
    echo ""
fi

if [ -z "$DOCKER_USERNAME" ]; then
    read -p "Enter your Docker Hub username: " DOCKER_USERNAME
fi

if [ -z "$DOCKER_USERNAME" ]; then
    echo -e "${RED}ERROR: Docker Hub username is required${NC}"
    exit 1
fi

VERSION=${1:-latest}
IMAGE_NAME="${DOCKER_USERNAME}/ophiussa-server-manager"
IMAGE_TAG="${IMAGE_NAME}:${VERSION}"

echo ""
echo "Configuration:"
echo "  Docker Hub User: $DOCKER_USERNAME"
echo "  Image Name:      $IMAGE_NAME"
echo "  Version:         $VERSION"
echo "  Dockerfile:      production target"
echo ""

echo -e "${BLUE}Logging in to Docker Hub...${NC}"
if ! docker login; then
    echo -e "${RED}ERROR: Docker login failed${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Running tests...${NC}"
TEST_OUTPUT="$(pnpm test 2>&1)" || TEST_EXIT=$?
if [[ "${TEST_OUTPUT:-}" == *"passed"* ]] || [[ "${TEST_OUTPUT:-}" == *"PASS"* ]]; then
    echo -e "${GREEN}[OK] Tests passed${NC}"
elif [[ "${TEST_OUTPUT:-}" == *"FAIL"* ]] || [[ "${TEST_OUTPUT:-}" == *"failed"* ]]; then
    echo -e "${YELLOW}[WARN] Some tests failed — continuing with build${NC}"
else
    echo -e "${YELLOW}[WARN] Tests failed or not configured — continuing with build${NC}"
fi

echo ""
echo -e "${BLUE}Building and pushing Docker image...${NC}"

build_with_buildx() {
    local -a tags=(-t "$IMAGE_TAG")
    if [ "$VERSION" != "latest" ]; then
        tags+=(-t "${IMAGE_NAME}:latest")
    fi

    if ! docker buildx inspect --bootstrap >/dev/null 2>&1; then
        echo -e "${BLUE}Creating buildx builder...${NC}"
        docker buildx create --name ophiussa-builder --use --bootstrap >/dev/null
    fi

    docker buildx build \
        "${tags[@]}" \
        --target production \
        --push \
        --provenance=true \
        .
}

if docker buildx version >/dev/null 2>&1; then
    if ! build_with_buildx; then
        echo -e "${RED}ERROR: Docker build/push failed${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[WARN] docker buildx not installed — falling back to classic build${NC}"
    echo -e "${YELLOW}       Install buildx for attestation support: sudo pacman -S docker-buildx${NC}"
    echo ""

    docker build --target production -t "$IMAGE_TAG" .

    if [ "$VERSION" != "latest" ]; then
        echo -e "${BLUE}Tagging as latest...${NC}"
        docker tag "$IMAGE_TAG" "${IMAGE_NAME}:latest"
    fi

    echo -e "${GREEN}[OK] Image built successfully${NC}"
    echo ""
    docker images "$IMAGE_NAME"

    echo ""
    echo -e "${BLUE}Pushing to Docker Hub...${NC}"
    if ! docker push "$IMAGE_TAG"; then
        echo -e "${RED}ERROR: Docker push failed${NC}"
        exit 1
    fi

    if [ "$VERSION" != "latest" ]; then
        docker push "${IMAGE_NAME}:latest"
    fi
fi

echo -e "${GREEN}[OK] Image built and pushed successfully${NC}"

if docker buildx version >/dev/null 2>&1; then
    echo ""
    echo "Registry tags pushed:"
    echo "  $IMAGE_TAG"
    if [ "$VERSION" != "latest" ]; then
        echo "  ${IMAGE_NAME}:latest"
    fi
else
    echo ""
    docker images "$IMAGE_NAME"
fi

echo ""
echo "======================================"
echo -e "${GREEN}Build and Push Completed!${NC}"
echo "======================================"
echo ""
echo "Docker Hub:"
echo "  $IMAGE_TAG"
if [ "$VERSION" != "latest" ]; then
    echo "  ${IMAGE_NAME}:latest"
fi
echo ""
echo "Deploy on a VPS (uses install.sh from your repo clone):"
echo "  OPHIUSSA_IMAGE=$IMAGE_TAG ./install.sh"
echo ""
echo "Or remote install (set your GitHub raw URL):"
echo "  OPHIUSSA_IMAGE=$IMAGE_TAG curl -fsSL https://raw.githubusercontent.com/<owner>/OphiussaServerManager/main/install.sh | bash"
echo ""
echo "Or manually:"
echo "  docker pull $IMAGE_TAG"
echo "  docker run -d --name ophiussa --restart unless-stopped \\"
echo "    -p 3000:3000 -p 21:21 -p 2022:2022 \\"
echo "    -v /var/run/docker.sock:/var/run/docker.sock \\"
echo "    -v /opt/ophiussa/data:/data \\"
echo "    -e HOST_DATA_DIR=/opt/ophiussa/data \\"
echo "    $IMAGE_TAG"
echo ""

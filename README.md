# Ophiussa Server Manager

Game server panel for a single Linux VPS. One **panel container** manages many **game server containers** through the Docker socket on the host.

```
┌─────────────────────────────────────────────────┐
│  Host (Linux VPS)                               │
│  ┌──────────────────┐   docker.sock             │
│  │ Ophiussa panel   │──────────────────────────►│ game-server-1
│  │ :3000 / :21 /    │                           │ game-server-2
│  │ :2022            │                           │ …
│  └────────┬─────────┘                           │
│           │ /data (SQLite, configs, saves)      │
└───────────┴─────────────────────────────────────┘
```

## Quick start (Docker)

**Requirements:** Linux with Docker Engine (not Docker Desktop on production), open ports for the panel and your games.

```bash
curl -fsSL https://raw.githubusercontent.com/Tiag0ss/OphiussaServerManager/main/install.sh | bash
```

Then open `http://<your-vps-ip>:3000/setup` and create the admin account.

The installer pulls `tiag0ss/ophiussa-server-manager:latest`, creates `/opt/ophiussa/data`, and starts the container with:

| Host port | Container | Purpose |
|-----------|-----------|---------|
| 3000 | 3000 | Web panel |
| 21 | 21 | FTP (per-server file access) |
| 2022 | 2022 | SFTP |

### Install script options

Override defaults with environment variables:

```bash
OPHIUSSA_IMAGE=tiag0ss/ophiussa-server-manager:0.1.0 \
OPHIUSSA_DATA_DIR=/opt/ophiussa/data \
OPHIUSSA_HTTP_PORT=3000 \
OPHIUSSA_FTP_PORT=21 \
OPHIUSSA_SFTP_PORT=2022 \
OPHIUSSA_CONTAINER_NAME=ophiussa \
  curl -fsSL https://raw.githubusercontent.com/Tiag0ss/OphiussaServerManager/main/install.sh | bash
```

Or run the script from a clone:

```bash
git clone https://github.com/Tiag0ss/OphiussaServerManager.git
cd OphiussaServerManager
./install.sh
```

### Manual `docker run`

```bash
mkdir -p /opt/ophiussa/data/{servers,backups,logs}

docker pull tiag0ss/ophiussa-server-manager:latest

docker run -d \
  --name ophiussa \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 21:21 \
  -p 2022:2022 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /opt/ophiussa/data:/data \
  tiag0ss/ophiussa-server-manager:latest
```

**Volumes**

| Mount | Purpose |
|-------|---------|
| `/var/run/docker.sock` | Create/start/stop game containers (required) |
| `/opt/ophiussa/data` → `/data` | SQLite DB, server configs, saves, backups, logs |

**Health check:** the image exposes `GET /api/health` (used by Docker `HEALTHCHECK`).

### Updating the panel

```bash
docker pull tiag0ss/ophiussa-server-manager:latest
docker stop ophiussa && docker rm ophiussa
./install.sh   # or re-run your docker run command
```

Game servers keep running while the panel is down; they are independent containers. After the panel restarts, it reconnects to existing containers via Docker.

---

## Building & publishing the image

The root `Dockerfile` is multi-stage:

| Stage | Use |
|-------|-----|
| `development` | Dev Container — hot reload, port 2121 for FTP |
| `production` | VPS deployment (default for install/build scripts) |

### One-command build & push

```bash
./docker-build.sh              # tags latest, pushes to Docker Hub
./docker-build.sh 0.1.0        # also tags :latest when version ≠ latest
DOCKER_USERNAME=tiag0ss ./docker-build.sh 0.1.0
```

The script runs tests, logs in to Docker Hub, and uses `docker buildx` when available (with provenance attestation).

### Manual build

```bash
docker build --target production -t tiag0ss/ophiussa-server-manager:0.1.0 .
docker push tiag0ss/ophiussa-server-manager:0.1.0
```

Uses **pnpm** (`corepack enable` + frozen lockfile). Do not use `npm install` in the Docker build context.

### Build troubleshooting

| Problem | Fix |
|---------|-----|
| `Cannot connect to the Docker daemon` | Start Docker: `sudo systemctl start docker`. Add your user to the `docker` group and open a new terminal. |
| Build fails on NTFS / external drive | Copy the project to an ext4 path first, e.g. `rsync -a --exclude node_modules --exclude .next . ~/OphiussaServerManager/` |
| `EACCES` on `.next` during local `pnpm run build` | Stop the dev server, then `sudo rm -rf .next` and rebuild |
| Game containers not visible in dev | Point `DOCKER_SOCKET` at your Docker Desktop socket (see `.env.example`) |

---

## Production checklist

1. **Reverse proxy + HTTPS** — do not expose port 3000 directly to the internet.
2. **Firewall** — only the reverse proxy should reach 3000; open game ports as needed.
3. **`AUTH_SECRET`** — set a long random value in production (see Environment below).
4. **docker.sock** — mounting it gives the panel root-equivalent access on the host. Run only on trusted VPS hardware you control.

Example Caddy:

```caddy
panel.example.com {
  reverse_proxy localhost:3000
}
```

### First run

1. Open `http://<vps>:3000/setup` — create admin, set public IP and port range.
2. **Settings → General** — network and host details.
3. **Settings → Alerts** — Discord webhook, generic webhook, or SMTP.

Login is rate-limited (10 attempts / 15 min per IP). Admin pages (Templates, Users, Settings, Audit) are hidden from regular users.

---

## Environment

Inside the container, data defaults to `/data` (`DATA_DIR`). For local development, data goes to `./data`.

| Variable | Default | Notes |
|----------|---------|-------|
| `AUTH_SECRET` | — | **Required in production.** Session signing key. |
| `DATA_DIR` | `/data` in image | Panel storage root |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker API socket path |
| `OPHIUSSA_NETWORK_MODE` | `auto` | Game container networking: `auto` \| `bridge` \| `host` |

See `.env.example` for development overrides (e.g. Docker Desktop socket, `OPHIUSSA_DIST_DIR` to avoid `.next` permission issues).

Pass env vars at runtime:

```bash
docker run -d ... \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  tiag0ss/ophiussa-server-manager:latest
```

---

## Development

For contributors — not required to run the panel on a VPS.

**Dev Container (recommended):**

1. Open in Cursor/VS Code → *Reopen in Container* (uses Dockerfile `development` stage).
2. `pnpm run dev` — panel on **3000**, FTP **2121**, SFTP **2022**.

**Local:**

```bash
pnpm install
pnpm run dev
pnpm test
```

The Docker socket must be available to spawn game containers. FTP uses port **2121** in dev (21 needs root); production image binds FTP on **21**.

---

## Features

- **Dashboard** — host & server metrics, history, sparklines, health checks
- **Templates** — Steam dedicated (generic App ID), Valheim, V Rising, Palworld, ARK, Minecraft, Satisfactory, Conan Exiles, and more
- **Lifecycle** — start/stop/restart, RCON save, pull image, clone, import/export
- **Monitoring** — Discord, webhook, email alerts; CPU/RAM/disk thresholds
- **Access** — users, quotas, per-server permissions, audit log
- **Files** — explorer-style browser (upload, download, copy/cut/paste), plus FTP + SFTP per server
- **Mods** — Thunderstore, CurseForge, Steam Workshop
- **Backups** — local backups with retention and cron schedules

## License

See repository license file if present.

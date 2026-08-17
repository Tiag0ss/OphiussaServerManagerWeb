# Ophiussa Server Manager

Game server panel for a single Linux VPS. The panel runs as one Docker image; each game server is a separate container managed through the Docker socket.

## Features

- **Dashboard** — host & server metrics with persistent history, sparklines, sorting, health checks
- **Templates** — Valheim, V Rising, Palworld, ARK ASE/ASA, Minecraft, Satisfactory, Conan Exiles, Core Keeper, Nightingale, Smalland, Dragonwilds, and more
- **Server lifecycle** — start / stop / restart / kill, graceful RCON save, pull latest image, clone, import/export JSON
- **Monitoring & alerts** — Discord, generic webhook, optional SMTP email; CPU/RAM/disk thresholds
- **Access control** — users, quotas, per-server shared permissions
- **Audit log** — panel actions recorded for admins
- **Files** — web file browser, embedded FTP + SFTP per server
- **Mods** — Thunderstore, CurseForge, Steam Workshop
- **Backups & schedules** — local backups with retention; cron tasks
- **Security** — session middleware, login rate limiting, admin-only settings

## Development (Dev Container)

1. Open this folder in Cursor/VS Code
2. Reopen in Container (uses the `development` stage of the root Dockerfile)
3. `npm run dev` — panel on port 3000, FTP **2121**, SFTP 2022

Local without Dev Container:

```bash
npm ci
npm run dev
npm test
```

Data is stored in `./data` automatically. FTP uses port **2121** in development (port 21 needs root). In the production image, FTP binds to 21.

Docker socket must be available to create game containers.

## Production

```bash
docker build -t tiag0ss/ophiussa-server-manager:0.1.0 .
docker push tiag0ss/ophiussa-server-manager:0.1.0

# on the VPS
curl -fsSL https://raw.githubusercontent.com/Tiag0ss/OphiussaServerManager/main/install.sh | bash
# or:
./install.sh
```

`install.sh` pulls the image and runs:

- `-p 3000:3000` panel
- `-p 21:21` FTP
- `-p 2022:2022` SFTP
- mounts `/var/run/docker.sock` and `/opt/ophiussa/data`

## Security

Mounting `docker.sock` is equivalent to root on the host. **Do not expose the panel publicly without protection.**

Recommended production setup:

1. Put **Caddy** or **Traefik** in front with HTTPS (Let's Encrypt).
2. Restrict panel port 3000 with firewall — only the reverse proxy should reach it.
3. Set a strong `AUTH_SECRET` in production (see `.env.example`).
4. Login is rate-limited (10 attempts / 15 min per IP).
5. Admin pages (Templates, Users, Settings, Audit) are hidden from regular users.

Example Caddy snippet:

```caddy
panel.example.com {
  reverse_proxy localhost:3000
}
```

## First run

Open `http://<vps>:3000/setup`, create the admin account, set public IP and port range.

Configure alerts under **Settings → Alerts** (Discord webhook, generic webhook, or SMTP).

## Environment

See `.env.example` for `AUTH_SECRET`, `DOCKER_SOCKET`, and network mode options.

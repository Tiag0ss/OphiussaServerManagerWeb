# Ophiussa Server Manager

Game server panel for a single Linux VPS. The panel runs as one Docker image; each game server is a separate container managed through the Docker socket.

## Features

- Dynamic template forms (Valheim, V Rising, Palworld, ARK ASE)
- Start / stop / restart / kill with graceful RCON save when available
- File manager, embedded FTP + SFTP per server
- Mod search/install: Thunderstore, CurseForge, Steam Workshop
- Backups, schedules, users & permissions
- Single image deploy (no Compose sidecars)

## Development (Dev Container)

1. Open this folder in Cursor/VS Code
2. Reopen in Container (uses the `development` stage of the root Dockerfile)
3. `npm run dev` — panel on port 3000, FTP **2121**, SFTP 2022

Local without Dev Container:

```bash
npm ci
npm run dev
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

**Security:** mounting `docker.sock` is equivalent to root on the host. Keep the panel private (firewall / reverse proxy auth).

## First run

Open `http://<vps>:3000/setup`, create the admin account, set public IP and port range.

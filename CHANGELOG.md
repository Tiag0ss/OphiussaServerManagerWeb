# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Steam dedicated template** — generic SteamCMD / Source server (`ich777/steamcmd`). Set App ID, SRCDS game folder, launch args, optional Steam login, and Workshop client App ID.
- **File explorer** — toolbar, breadcrumbs, list/icon views, multi-select, copy/cut/paste, rename, download, drag-and-drop upload, and a text editor modal.

## [0.1.0] - 2026-08-17

### Added
- **Game templates** — RuneScape Dragonwilds, Core Keeper, Conan Exiles, ARK Survival Ascended, Satisfactory, Smalland, and Nightingale. TCP+UDP on the same container port now share one host port (Satisfactory / Nightingale).
- **Port Allocation & User Port Ranges** (`b03c950`)
  - User-defined port range configuration per user.
  - Automatic suggested free ports based on selected server templates.
  - Dedicated `/api/me` endpoint to retrieve current user profile and port range preferences.
  - `MultiSelect` and `SecretInput` UI components for server and template configuration forms.
  - Direct backup download endpoint (`/api/servers/[id]/backups/[backupId]/download`).
- **Core Server Management & Docker Integration** (`661a6cb`)
  - Web panel dashboard with server status monitoring, logs viewer, and interactive RCON console.
  - Pre-configured game server templates for ARK: Survival Evolved, Palworld, Valheim, and V Rising.
  - Server file management with built-in web file browser and integrated FTP/SFTP support.
  - Automated backup creation and restoration mechanism.
  - Scheduled tasks runner for periodic maintenance and commands.
  - User authentication and access control with SQLite database backed by Drizzle ORM.
  - Multi-stage `Dockerfile`, installation script (`install.sh`), and devcontainer configuration for rapid deployment.
- **Initial Project Setup** (`e9b4ee1`)
  - Initialized Next.js project with TypeScript, Tailwind CSS, and App Router.

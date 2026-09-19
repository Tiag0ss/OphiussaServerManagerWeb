"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-card-elevated px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
      {children}
    </code>
  );
}

function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {label && (
        <div className="border-b border-border bg-card-elevated px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          {label}
        </div>
      )}
      <pre className="overflow-x-auto bg-[#06090e] p-4 text-xs leading-relaxed text-foreground">
        <code className="font-mono">{children}</code>
      </pre>
    </div>
  );
}

function Callout({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border p-3 text-sm",
        kind === "warn"
          ? "border-warn/30 bg-warn/10 text-warn"
          : "border-accent/30 bg-accent-soft text-foreground",
      )}
    >
      {children}
    </p>
  );
}

type Row = Record<string, React.ReactNode>;

function RefTable({ columns, rows }: { columns: string[]; rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border bg-card-elevated">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {columns.map((c) => (
                <td key={c} className="px-3 py-2 align-top">
                  {row[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One documentation subsection: a heading + boxed content, tracked by the sidebar scrollspy. */
function Doc({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-6 space-y-3">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </Card>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-2 text-lg font-semibold first:pt-0">{children}</h2>
  );
}

const NAV: Array<{ label: string; items: Array<{ id: string; label: string }> }> = [
  {
    label: "Getting started",
    items: [
      { id: "overview", label: "Overview" },
      { id: "concepts", label: "Core concepts" },
    ],
  },
  {
    label: "Using the panel",
    items: [
      { id: "creating-a-server", label: "Creating a server" },
      { id: "server-tabs", label: "Server tabs" },
      { id: "config-screen", label: "The Config screen" },
      { id: "rcon-usage", label: "RCON" },
      { id: "backups-usage", label: "Backups" },
      { id: "schedules-usage", label: "Schedules" },
      { id: "mods-usage", label: "Mods" },
      { id: "alerts-usage", label: "Alerts & webhooks" },
      { id: "users-quotas", label: "Users, quotas & access" },
    ],
  },
  {
    label: "Template reference",
    items: [
      { id: "how-templates-load", label: "How templates load" },
      { id: "top-level", label: "Top-level keys" },
      { id: "runtime", label: "runtime" },
      { id: "ports", label: "Ports" },
      { id: "volumes-files", label: "Volumes & files" },
      { id: "backup", label: "backup (template)" },
      { id: "rcon-ref", label: "rcon (template)" },
      { id: "mods-ref", label: "mods (template)" },
      { id: "options", label: "options" },
      { id: "fields", label: "fields" },
      { id: "field-types", label: "Field types" },
      { id: "bind", label: "bind (FieldBind)" },
      { id: "showif", label: "showIf" },
    ],
  },
  {
    label: "Building a template",
    items: [
      { id: "build-steps", label: "Step by step" },
      { id: "example-env", label: "Example: plain env vars" },
      { id: "example-ini", label: "Example: ini file" },
      { id: "example-query", label: "Example: combined launch string" },
    ],
  },
  {
    label: "Troubleshooting",
    items: [
      { id: "troubleshooting", label: "A field does nothing" },
      { id: "lessons", label: "Lessons & gotchas" },
    ],
  },
];

const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id));

// Distance from the viewport top a section's heading lands at after an
// anchor jump (matches the `scroll-mt-6` = 24px on each <Doc>, plus a
// little slack). Keeping this in sync with scroll-mt-6 is what makes the
// highlighted link match whichever section a click actually lands on.
const SCROLLSPY_OFFSET = 32;

function DocsNav() {
  const [active, setActive] = useState<string>(ALL_IDS[0] ?? "");

  useEffect(() => {
    function onScroll() {
      let current = ALL_IDS[0] ?? "";
      for (const id of ALL_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - SCROLLSPY_OFFSET <= 0) {
          current = id;
        } else {
          break;
        }
      }
      setActive(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav className="space-y-5 text-sm">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted/70">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-[13px] transition",
                  active === item.id
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:bg-card-elevated hover:text-foreground",
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function DocsPage() {
  return (
    <div className="flex w-full items-start gap-8">
      <aside className="sticky top-6 hidden w-56 shrink-0 self-start lg:block">
        <DocsNav />
      </aside>

      <div className="min-w-0 flex-1 space-y-8 pb-24">
        <div>
          <h1 className="text-2xl font-semibold">Documentation</h1>
          <p className="mt-1 text-sm text-muted">
            How Ophiussa Server Manager works end to end, and a complete,
            code-accurate reference for writing and editing game templates.
          </p>
        </div>

        {/* ---------------- Getting started ---------------- */}
        <GroupHeading>Getting started</GroupHeading>

        <Doc id="overview" title="Overview">
          <p>
            Ophiussa Server Manager hosts game server containers with Docker.
            Every game a server can run is described by a{" "}
            <strong>template</strong> — a YAML file that says which Docker
            image to run, which ports/volumes it needs, which settings the
            user is allowed to configure, and how those settings actually
            reach the container. Templates are what make the rest of the
            panel generic: the server detail page, the config form, the
            create-server wizard, mods, RCON, and backups all read from the
            same template definition instead of having per-game code
            scattered around the app.
          </p>
          <p>
            The panel itself runs as one container with access to the host&apos;s
            Docker socket, so it can create, start, stop and recreate game
            containers, read their logs, and query their live resource usage.
            Each server gets its own data directory on the host (bind-mounted
            into its container), its own allocated host ports, and its own
            row of config values in the database.
          </p>
        </Doc>

        <Doc id="concepts" title="Core concepts">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Server</strong> — one game instance: a Docker container,
              a data directory, allocated host ports, and a JSON blob of
              config values matching its template&apos;s fields.
            </li>
            <li>
              <strong>Template</strong> — the YAML definition for a game. See{" "}
              <Link href="#top-level" className="text-accent hover:underline">
                Template reference
              </Link>
              .
            </li>
            <li>
              <strong>Config</strong> — the per-server values for a
              template&apos;s fields. Turned into container env vars / CLI
              args / config-file contents on every create or recreate.
            </li>
            <li>
              <strong>Schedule</strong> — a cron-triggered action for one
              server: start, stop, restart, backup, update image, or an RCON
              command.
            </li>
            <li>
              <strong>Backup</strong> — either a panel-tracked archive
              (<Code>.tar.gz</Code>, made via the Backups tab or a schedule)
              or a backup the game makes itself inside its own data folder,
              which the panel only surfaces read-only.
            </li>
            <li>
              <strong>Mod</strong> — installed from Thunderstore, CurseForge
              or Steam Workshop into the server&apos;s data directory, per the
              template&apos;s <Code>mods</Code> block.
            </li>
            <li>
              <strong>RCON</strong> — a remote console connection used for
              graceful saves before stop, health checks, and the Console
              tab&apos;s command box. Either declared natively by the
              template, or enabled manually per server when the game has RCON
              but the template doesn&apos;t know about it (e.g. added by a
              mod).
            </li>
            <li>
              <strong>Alert / webhook</strong> — panel-wide Discord/webhook/
              email notifications, plus an optional per-server Discord
              webhook field some templates expose.
            </li>
            <li>
              <strong>Quota</strong> — per-user limits (max servers, total
              RAM, total CPU) an admin sets; enforced when creating a server
              or changing its resources.
            </li>
          </ul>
        </Doc>

        {/* ---------------- Using the panel ---------------- */}
        <GroupHeading>Using the panel</GroupHeading>

        <Doc id="creating-a-server" title="Creating a server">
          <p>
            <Code>Servers → New</Code> is a two-step wizard: pick a template,
            then configure it. Templates marked <Code>tested: true</Code> show
            a green &quot;Tested&quot; badge on their card; everything else
            shows an amber &quot;Untested&quot; badge with a note that it may
            have rough edges — that flag is set per template (see{" "}
            <Link href="#top-level" className="text-accent hover:underline">
              Top-level keys
            </Link>
            ) and only means &quot;verified end-to-end by an admin&quot;, not
            &quot;broken&quot;. Port allocation, the data directory, and the
            FTP/SFTP account are all created automatically; the first field of
            the picked template that determines the display name pre-fills
            from the template name.
          </p>
        </Doc>

        <Doc id="server-tabs" title="Server tabs">
          <p>
            Each server page has a sticky header (name, health badge,
            start/stop/restart/kill) and tab row, followed by: Overview (live
            CPU/RAM charts), Config, Console (log stream + a separate,
            persistent RCON command/response panel), Files (browser with
            upload/download/rename plus FTP/SFTP credentials), Mods, Backups,
            Schedules, Access (per-user permission toggles for this one
            server) and Danger (clone, export/import JSON config, pull the
            latest image, delete).
          </p>
        </Doc>

        <Doc id="config-screen" title="The Config screen">
          <p>
            The Config tab merges the template&apos;s own field groups
            (Server, World, Rules, …) with two panel-managed sections —
            &quot;Network &amp; resources&quot; (host ports, FTP/SFTP,
            RAM/CPU limits) and &quot;RCON&quot; — into one tab row, so
            there&apos;s a single place to configure everything about a
            server. A fixed action bar at the bottom shows &quot;Save &amp;
            recreate container&quot; whenever you&apos;re on a game-settings
            tab.
          </p>
          <Callout>
            Saving only recreates the container when something that actually
            reaches it changed (config values, RAM/CPU, ports, or RCON) — the
            backend diffs the new config against what&apos;s stored, so a
            no-op save no longer causes downtime.
          </Callout>
        </Doc>

        <Doc id="rcon-usage" title="RCON">
          <p>
            If the template declares an <Code>rcon</Code> block (
            <Link href="#rcon-ref" className="text-accent hover:underline">
              reference
            </Link>
            ), RCON works out of the box: the Console tab&apos;s command box
            sends through it, and the panel uses it internally for graceful
            saves before stop/backup and for health checks. If the template
            has no native RCON but the game supports it anyway (e.g. a
            Valheim RCON mod), Config → RCON lets you enable it manually for
            that one server: pick a port (used as both host and container
            port, since the panel doesn&apos;t know the template&apos;s own
            port-naming scheme) and a password, and it&apos;s published on
            the next recreate.
          </p>
        </Doc>

        <Doc id="backups-usage" title="Backups">
          <p>
            The Backups tab shows two independent things:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Panel backups</strong> — made via &quot;Create
              backup&quot; or a schedule, archived as <Code>.tar.gz</Code>{" "}
              from whatever the template&apos;s <Code>backup.include</Code>{" "}
              paths point at, listed with download/restore/delete.
            </li>
            <li>
              <strong>Game auto-backups</strong> (only shown when present) —
              read-only entries for files the game itself created in its own{" "}
              <Code>backups/</Code> folder (e.g. Valheim&apos;s built-in
              scheduled backup). Download or delete them, but restoring
              isn&apos;t offered since their internal format isn&apos;t the
              panel&apos;s own archive format — copy the contents back
              manually via the Files tab if you ever need to.
            </li>
          </ul>
        </Doc>

        <Doc id="schedules-usage" title="Schedules">
          <p>
            A schedule pairs a cron expression with one action:{" "}
            <Code>start</Code>, <Code>stop</Code>, <Code>restart</Code>,{" "}
            <Code>backup</Code>, <Code>update-image</Code> (pull the latest
            image and recreate), or <Code>rcon</Code> (run a specific
            command, e.g. an in-game announcement). The cron field uses a
            friendly builder (disabled / every N minutes / every N hours /
            daily / weekly / a raw custom expression) instead of requiring you
            to know cron syntax. Each schedule can be run immediately with
            &quot;Run now&quot;, toggled on/off without deleting it, and shows
            the outcome of its last run (including the error message on
            failure).
          </p>
        </Doc>

        <Doc id="mods-usage" title="Mods">
          <p>
            The Mods tab searches whichever providers the template declares
            (Thunderstore/CurseForge/Steam Workshop) and installs into the
            path set by the template&apos;s <Code>mods.installPath</Code>.
            Thunderstore packages are unwrapped automatically regardless of
            how the zip is laid out — the panel searches (breadth-first, up
            to 4 levels deep) for a folder literally named <Code>BepInEx</Code>{" "}
            or <Code>plugins</Code> anywhere inside the archive and merges
            that into place; if neither exists, any single top-level wrapper
            folder is unwrapped and the rest is dropped flat.
          </p>
          <Callout kind="warn">
            The game images only pick up a newly installed mod at container
            <strong> start</strong> (they sync the mods folder into their
            live runtime path on boot). Installing or removing a mod does not
            restart the server automatically — do it manually via
            start/stop/restart when you&apos;re ready.
          </Callout>
        </Doc>

        <Doc id="alerts-usage" title="Alerts & webhooks">
          <p>
            Settings → Alerts configures global notification channels
            (Discord webhook, generic webhook, email) and CPU/RAM/disk
            thresholds. These fire for threshold breaches, degraded/down
            health, scheduled-backup failures, and server lifecycle events
            (installed, started, stopped, deleted). Some templates
            additionally expose their own &quot;Discord webhook URL&quot;
            config field (conventionally keyed <Code>discordWebhook</Code>) —
            since the game image that field was originally meant for often
            doesn&apos;t implement it itself, the panel posts to it directly
            for that one server&apos;s lifecycle events, independent of the
            global channel.
          </p>
        </Doc>

        <Doc id="users-quotas" title="Users, quotas & access">
          <p>
            Admins manage accounts under Users: role (admin/user), a max
            server count, max total RAM and CPU across owned servers, an
            optional restricted list of allowed templates, and an optional
            per-user host-port range (falls back to the panel-wide range when
            unset). Per-server, the Access tab grants individual non-owner
            users specific permissions (start/stop/console/files/mods/backup/
            settings) without making them a full admin.
          </p>
        </Doc>

        {/* ---------------- Template reference ---------------- */}
        <GroupHeading>Template reference</GroupHeading>

        <Doc id="how-templates-load" title="How templates load">
          <p>
            Templates live as <Code>.yaml</Code> files in the repo&apos;s{" "}
            <Code>templates/</Code> directory. On every read the panel scans
            that directory and upserts each file into the database (
            <Code>syncTemplatesToDb</Code>), so editing a file on disk and
            reloading the panel is enough to see the change.
          </p>
          <Callout kind="warn">
            That sync <strong>only</strong> applies to templates whose
            database row still has <Code>source: &quot;builtin&quot;</Code>.
            Saving a template through the admin Templates editor UI flips it
            to <Code>source: &quot;custom&quot;</Code>, and custom rows are
            deliberately never overwritten by the on-disk sync again (so an
            admin&apos;s in-panel edits aren&apos;t silently discarded by a
            later file change). If you maintain a template by editing the
            YAML file directly, don&apos;t also save it through the UI, or it
            will permanently stop following the file — you&apos;d need to
            reset its <Code>source</Code> back to <Code>builtin</Code>{" "}
            directly in the database to resume auto-sync.
          </Callout>
          <p>
            A template only strictly needs <Code>id</Code>, <Code>name</Code>,
            and <Code>runtime.image</Code> — everything else defaults to
            empty/off. There is no schema validator beyond that, so a typo in
            a field name or bind path fails silently (the field just does
            nothing) instead of erroring at load time. Always click through
            and confirm a new field actually changes the running server.
          </p>
        </Doc>

        <Doc id="top-level" title="Top-level keys">
          <RefTable
            columns={["Key", "Required", "Description"]}
            rows={[
              { Key: <Code>id</Code>, Required: "yes", Description: "Unique slug — DB primary key and part of the generated container name." },
              { Key: <Code>name</Code>, Required: "yes", Description: "Display name shown throughout the UI." },
              { Key: <Code>description</Code>, Required: "no", Description: "One-line subtitle shown on the template card." },
              { Key: <Code>icon</Code>, Required: "no", Description: "Reserved for a future icon; currently unused by the UI." },
              { Key: <Code>tested</Code>, Required: "no", Description: <>Boolean. Drives the &quot;Tested&quot;/&quot;Untested&quot; badge. Only set <Code>true</Code> after real end-to-end verification — see <Link href="#lessons" className="text-accent hover:underline">Lessons &amp; gotchas</Link>.</> },
              { Key: <Code>runtime</Code>, Required: "yes", Description: <>Image, resources, ports, volumes, files, backup config. See <Link href="#runtime" className="text-accent hover:underline">runtime</Link>.</> },
              { Key: <Code>rcon</Code>, Required: "no", Description: <>Native RCON wiring. See <Link href="#rcon-ref" className="text-accent hover:underline">rcon</Link>.</> },
              { Key: <Code>mods</Code>, Required: "no", Description: <>Mod provider config. See <Link href="#mods-ref" className="text-accent hover:underline">mods</Link>.</> },
              { Key: <Code>options</Code>, Required: "no", Description: <>Named, reusable dropdown option lists. See <Link href="#options" className="text-accent hover:underline">options</Link>.</> },
              { Key: <Code>fields</Code>, Required: "yes (array)", Description: <>The user-editable config form. See <Link href="#fields" className="text-accent hover:underline">fields</Link>. An empty array is valid.</> },
            ]}
          />
        </Doc>

        <Doc id="runtime" title="runtime">
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>image</Code>, Type: "string", Description: "Docker image, e.g. \"itzg/minecraft-server\". Pulled fresh on every create/recreate." },
              { Key: <Code>stopTimeout</Code>, Type: "number (s)", Description: "Grace period passed to \"docker stop\" before SIGKILL. Default 60." },
              { Key: <Code>restartPolicy</Code>, Type: "string", Description: "Docker restart policy, typically \"unless-stopped\"." },
              { Key: <Code>memoryMb</Code>, Type: "number", Description: "Default RAM (MB) suggested when creating a server; the owner can change it within their quota." },
              { Key: <Code>cpuLimit</Code>, Type: "number", Description: "Default CPU limit (cores) suggested when creating a server." },
              { Key: <Code>env</Code>, Type: "map<string,string>", Description: "Static env vars always set (e.g. TZ, EULA), merged underneath whatever fields bind to \"env\"." },
              { Key: <Code>ports</Code>, Type: "TemplatePort[]", Description: <>Required (can be empty). See <Link href="#ports" className="text-accent hover:underline">Ports</Link>.</> },
              { Key: <Code>volumes</Code>, Type: "TemplateVolume[]", Description: <>Required (can be empty). Only the first entry is actually mounted today — the server&apos;s single data directory. See <Link href="#volumes-files" className="text-accent hover:underline">Volumes &amp; files</Link>.</> },
              { Key: <Code>files</Code>, Type: "TemplateFile[]", Description: <>Config files the panel reads/writes for <Code>ini</Code>/<Code>json</Code> binds. See <Link href="#volumes-files" className="text-accent hover:underline">Volumes &amp; files</Link>.</> },
              { Key: <Code>user</Code>, Type: "string", Description: "Reserved — most images manage their own user via PUID/PGID env vars instead. Leave unset unless a specific image needs an explicit Docker \"User\"." },
              { Key: <Code>backup</Code>, Type: "TemplateBackup", Description: <>What a panel-created backup archives. See <Link href="#backup" className="text-accent hover:underline">backup</Link>.</> },
            ]}
          />
        </Doc>

        <Doc id="ports" title="Ports — TemplatePort">
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>key</Code>, Type: "string", Description: "Identifier used everywhere else that refers to this port: RCON's portKey, the Network tab, port-sharing logic." },
              { Key: <Code>container</Code>, Type: "number", Description: "Port the process listens on inside the container." },
              { Key: <Code>protocol</Code>, Type: "\"tcp\" | \"udp\"", Description: "" },
              { Key: <Code>listenEnv</Code>, Type: "string", Description: "Env var set to the allocated host port, for images that must know their own advertised port. Used for the host-network fallback when Docker port publishing is broken, and for Unreal-engine-style games that advertise the exact host port back to clients." },
              { Key: <Code>matchHost</Code>, Type: "boolean", Description: "Publish hostPort:hostPort (not hostPort:container) even in normal bridge networking, and set listenEnv to that same value. Needed by engines (Unreal, Satisfactory) that require the internal and external port to match." },
            ]}
          />
          <p>
            A user can remap the host side of each port, within the
            panel&apos;s (or their own) allowed range, from Config → Network
            &amp; resources — the container-side port never changes.
          </p>
        </Doc>

        <Doc id="volumes-files" title="Volumes & files">
          <p className="font-medium text-foreground">volumes — TemplateVolume</p>
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>key</Code>, Type: "string", Description: "Identifier (currently only used internally)." },
              { Key: <Code>container</Code>, Type: "string", Description: "Absolute path inside the container that maps to the server's persistent data directory on the host." },
            ]}
          />
          <p className="pt-2 font-medium text-foreground">files — TemplateFile</p>
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>path</Code>, Type: "string", Description: "Path relative to the data directory, e.g. \"Settings/ServerHostSettings.json\"." },
              { Key: <Code>format</Code>, Type: "\"ini\" | \"json\" | \"env\"", Description: "Only \"ini\" and \"json\" are actually read/written today — declaring \"env\" has no effect." },
            ]}
          />
          <p>
            When a field binds with <Code>ini:</Code> or <Code>json:</Code>{" "}
            (see <Link href="#bind" className="text-accent hover:underline">bind</Link>), the panel reads the existing file
            from disk if present — so anything the game itself already wrote
            there is preserved — overlays every bound field&apos;s value, and
            writes the file back on every create/recreate.
          </p>
          <Callout kind="warn">
            <strong>Known limitation:</strong> if a template declares more
            than one <Code>ini</Code> file (or more than one <Code>json</Code>{" "}
            file), every <Code>ini:</Code>/<Code>json:</Code>-bound field is
            written to whichever one is listed <em>first</em> in{" "}
            <Code>files</Code>, regardless of which file it should logically
            belong to. V Rising is the one template with two JSON files
            today; its game-setting fields deliberately use{" "}
            <Code>env: GAME_SETTINGS_*</Code> passthrough instead of{" "}
            <Code>json:</Code> to sidestep this entirely. If you add a second
            file to a template, only bind the file listed first with{" "}
            <Code>ini</Code>/<Code>json</Code>, and use a plain{" "}
            <Code>env</Code> passthrough (if the image supports one) for
            anything that belongs in the second file.
          </Callout>
        </Doc>

        <Doc id="backup" title="backup — TemplateBackup">
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>include</Code>, Type: "string[]", Description: "Paths (relative to the data directory) archived into a panel backup. If omitted, every top-level entry in the data directory is included except the global exclusions below." },
              { Key: <Code>exclude</Code>, Type: "string[]", Description: "Extra path prefixes to skip, on top of the always-skipped steamapps/steamcmd/Steam/.steam/linux64/linux32/Package/depotcache/appcache/.cache/node_modules." },
              { Key: <Code>stopServer</Code>, Type: "boolean", Description: "Stop the container before archiving instead of relying on an RCON save + live copy. Slower, but guarantees a consistent snapshot for games with no reliable RCON save command. Default false." },
            ]}
          />
          <p>
            This only affects <em>panel-created</em> backups (Backups tab,
            schedules) — it has nothing to do with a game&apos;s own built-in
            auto-backup feature, which is configured through ordinary{" "}
            <Code>fields</Code> like any other setting and only ever surfaced
            read-only (see{" "}
            <Link href="#backups-usage" className="text-accent hover:underline">
              Backups
            </Link>
            ).
          </p>
        </Doc>

        <Doc id="rcon-ref" title="rcon — TemplateRcon">
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>enabled</Code>, Type: "boolean", Description: "Must be true for the template to be treated as having native RCON." },
              { Key: <Code>portKey</Code>, Type: "string", Description: <>Which <Code>ports</Code> entry&apos;s allocated host port to connect to. Defaults to <Code>&quot;rcon&quot;</Code>.</> },
              { Key: <Code>passwordField</Code>, Type: "string", Description: <>Which <Code>fields</Code> key holds the RCON password. Defaults to <Code>&quot;rconPassword&quot;</Code>.</> },
              { Key: <Code>saveCommand</Code>, Type: "string", Description: "RCON command sent before a graceful stop and before a live (non-stopServer) backup, e.g. \"save-all\", \"saveworld\", \"save\". Leave unset if the game has no save-on-demand command." },
            ]}
          />
          <p>
            Connections are always made to <Code>127.0.0.1</Code> at the
            resolved host port. If a template has no native RCON but the game
            supports it anyway, the per-server manual override (see{" "}
            <Link href="#rcon-usage" className="text-accent hover:underline">RCON</Link>) stores an equivalent port + a{" "}
            <Code>rconPassword</Code> config value, so the same connection
            logic works either way.
          </p>
        </Doc>

        <Doc id="mods-ref" title="mods — TemplateMods">
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>providers</Code>, Type: "(\"thunderstore\"|\"curseforge\"|\"steam-workshop\")[]", Description: "Which sources appear in the Mods tab's search." },
              { Key: <Code>thunderstoreNamespace</Code>, Type: "string", Description: "Thunderstore community slug, e.g. \"valheim\", \"v-rising\"." },
              { Key: <Code>curseforgeGameId</Code>, Type: "number", Description: "CurseForge numeric game id." },
              { Key: <Code>workshopAppId</Code>, Type: "number", Description: "Steam Workshop app id, used for search + downloads via SteamCMD." },
              { Key: <Code>installPath</Code>, Type: "string", Description: "Path (relative to the data directory) mods get extracted into, e.g. \"bepinex/plugins\", \"ShooterGame/Content/Mods\"." },
              { Key: <Code>bind</Code>, Type: "FieldBind", Description: <>Optional — writes the list of currently-installed mods into an env var (see <Link href="#bind" className="text-accent hover:underline">bind</Link>) for images that must be told which mods to load, typically with <Code>join: &quot;,&quot;</Code>.</> },
            ]}
          />
        </Doc>

        <Doc id="options" title="options">
          <p>
            A map of named arrays of <Code>{"{ value, label }"}</Code> pairs,
            referenced from a field via <Code>optionsFrom</Code> instead of
            repeating the same list inline everywhere it&apos;s needed (e.g. a
            shared list of maps used by both a top-level &quot;map&quot;
            select and a per-row select inside a list field).
          </p>
          <CodeBlock>{`options:
  difficulty:
    - { value: easy, label: Easy }
    - { value: normal, label: Normal }
    - { value: hard, label: Hard }

fields:
  - key: difficulty
    type: select
    optionsFrom: difficulty
    default: normal`}</CodeBlock>
        </Doc>

        <Doc id="fields" title="fields — TemplateField">
          <p>
            Each entry describes one setting the user can edit. Fields
            sharing a <Code>group</Code> are shown together under one tab on
            the Config screen.
          </p>
          <RefTable
            columns={["Key", "Type", "Description"]}
            rows={[
              { Key: <Code>key</Code>, Type: "string", Description: "Config JSON key, unique within the template. Renaming an existing key orphans any already-saved value on existing servers — prefer fixing the label instead of the key once a template is in use." },
              { Key: <Code>type</Code>, Type: "FieldType", Description: <>See <Link href="#field-types" className="text-accent hover:underline">Field types</Link>.</> },
              { Key: <Code>label</Code>, Type: "string", Description: "Shown above the input. Falls back to the raw key if omitted." },
              { Key: <Code>description</Code>, Type: "string", Description: "Small helper text under the input." },
              { Key: <Code>group</Code>, Type: "string", Description: "Tab name. Defaults to \"General\" if omitted." },
              { Key: <Code>required</Code>, Type: "boolean", Description: "Cosmetic only (marks the input required in the browser) — not enforced server-side." },
              { Key: <Code>secret</Code>, Type: "boolean", Description: "Renders as a password-style input with a reveal toggle instead of plain text." },
              { Key: <Code>advanced</Code>, Type: "boolean", Description: "Hidden unless the Config form's \"Advanced\" toggle is on." },
              { Key: <Code>placeholder</Code>, Type: "string", Description: "Input placeholder text." },
              { Key: <Code>default</Code>, Type: "any", Description: "Seeded into a new server's config. If omitted: false for booleans, [] for lists, min (or 0) for number/slider/port, \"\" for everything else." },
              { Key: <><Code>min</Code> / <Code>max</Code> / <Code>step</Code></>, Type: "number", Description: "For number/slider/port types." },
              { Key: <Code>options</Code>, Type: "FieldOption[]", Description: "Inline option list for a select field." },
              { Key: <Code>optionsFrom</Code>, Type: "string", Description: <>Name of an entry under the template&apos;s top-level <Code>options</Code> map instead of an inline list.</> },
              { Key: <Code>item</Code>, Type: "object", Description: <>Only for <Code>type: list</Code> — see <Link href="#field-types" className="text-accent hover:underline">Field types</Link>.</> },
              { Key: <Code>bind</Code>, Type: "FieldBind", Description: <>How the value reaches the container. See <Link href="#bind" className="text-accent hover:underline">bind</Link>. Omit it for a field that&apos;s purely informational or only read by other panel logic (e.g. a manual RCON password).</> },
              { Key: <Code>showIf</Code>, Type: "ShowIf", Description: <>Conditionally hide the field. See <Link href="#showif" className="text-accent hover:underline">showIf</Link>.</> },
            ]}
          />
        </Doc>

        <Doc id="field-types" title="Field types">
          <RefTable
            columns={["type", "Renders as", "Config value"]}
            rows={[
              { type: <Code>string</Code>, "Renders as": "single-line text input (password input if secret)", "Config value": "string" },
              { type: <Code>text</Code>, "Renders as": "multi-line textarea", "Config value": "string" },
              { type: <Code>number</Code>, "Renders as": "numeric input", "Config value": "number" },
              { type: <Code>slider</Code>, "Renders as": "numeric input + range slider, live value shown in the label", "Config value": "number" },
              { type: <Code>boolean</Code>, "Renders as": "checkbox", "Config value": "boolean" },
              { type: <Code>select</Code>, "Renders as": "dropdown from options / optionsFrom", "Config value": "string (the option's value)" },
              { type: <Code>list</Code>, "Renders as": "repeatable row(s) with Add/Remove, per item.type", "Config value": "array" },
              { type: <Code>port</Code>, "Renders as": "numeric input (same as number)", "Config value": "number" },
              { type: <Code>cron</Code>, "Renders as": "friendly cron builder (disabled / every N minutes / every N hours / daily / weekly / custom)", "Config value": "string, standard 5-field cron syntax (or \"\" if disabled)" },
              { type: <Code>group</Code>, "Renders as": "nothing — reserved/ignored by the config builder", "Config value": "—" },
            ]}
          />
          <p className="pt-2 font-medium text-foreground">list — the item shape</p>
          <RefTable
            columns={["Key", "Description"]}
            rows={[
              { Key: <Code>item.type</Code>, Description: <><Code>&quot;string&quot;</Code> or <Code>&quot;number&quot;</Code> for a flat list of primitives, or <Code>&quot;object&quot;</Code> for a list of structured rows.</> },
              { Key: <Code>item.placeholder</Code>, Description: "Placeholder for a string/number item's input." },
              { Key: <Code>item.fields</Code>, Description: <>Only for <Code>item.type: object</Code> — an array of sub-fields (same shape as a top-level field, minus group/advanced/showIf) rendered per row.</> },
            ]}
          />
          <CodeBlock>{`- key: ops
  type: list
  label: Operators (UUID or name)
  item: { type: string, placeholder: "Notch" }
  default: []
  bind: { env: OPS, join: "," }

- key: dinoSpawnWeight
  type: list
  label: Dino spawn weight overrides
  default: []
  item:
    type: object
    fields:
      - { key: class, type: select, label: Dino, optionsFrom: dinos }
      - { key: weight, type: slider, label: Weight, min: 0, max: 10, step: 0.1, default: 1 }`}</CodeBlock>
        </Doc>

        <Doc id="bind" title="bind — FieldBind">
          <p>
            <Code>bind</Code> says how a field&apos;s value actually reaches
            the running container. A field with no <Code>bind</Code> is
            stored in the server&apos;s config but never applied anywhere —
            useful for values only read by other panel logic (an RCON
            password field) or ones you haven&apos;t wired up yet. Every bind
            is skipped entirely when the value is <Code>undefined</Code>,{" "}
            <Code>null</Code>, or an empty string.
          </p>
          <RefTable
            columns={["Key", "Description"]}
            rows={[
              { Key: <Code>env</Code>, Description: "Container environment variable name." },
              { Key: <Code>ini</Code>, Description: <>Dotted <Code>Section.Key</Code> path into the (first) <Code>ini</Code> file declared in <Code>runtime.files</Code>. Only one level of section nesting is supported.</> },
              { Key: <Code>json</Code>, Description: <>Dotted path (any depth) into the (first) <Code>json</Code> file declared in <Code>runtime.files</Code>, e.g. <Code>&quot;visibility.public&quot;</Code>.</> },
              { Key: <Code>arg</Code>, Description: "A literal string prepended to the formatted value and appended as one CLI argument, e.g. arg: \"-MaxPlayers=\" writes -MaxPlayers=40." },
              { Key: <Code>join</Code>, Description: <>Separator used when the value is an array (list field). Defaults to <Code>&quot;,&quot;</Code>.</> },
              { Key: <Code>prefix</Code>, Description: "String prepended to the formatted value before it's written, e.g. prefix: \"-worldseed \" for an arg-less env fragment." },
              { Key: <Code>ifTrue</Code>, Description: "For booleans only: instead of writing the value, emit this literal fragment (into env or arg) only when the value is exactly true; nothing is written when false. Useful for on/off CLI flags with no \"off\" form." },
              { Key: <Code>trueFalse</Code>, Description: <>Format booleans as the strings <Code>&quot;true&quot;</Code>/<Code>&quot;false&quot;</Code> instead of the default <Code>&quot;1&quot;</Code>/<Code>&quot;0&quot;</Code>. Most Docker images expect this — set it on every boolean <Code>env</Code> bind unless you&apos;ve confirmed the image wants 1/0.</> },
              { Key: <Code>queryParam</Code>, Description: <>Composes the field into <Code>env</Code> as an ARK-style <Code>?Key=Value</Code> fragment appended onto whatever&apos;s already in that env var, instead of setting it directly — for images whose entire configuration is one combined launch-string env var. Booleans render as <Code>True</Code>/<Code>False</Code>. Multiple fields can safely share the same <Code>env</Code> this way.</> },
              { Key: <Code>rawAppend</Code>, Description: <>Append the formatted value directly onto an existing <Code>env</Code> value with no separator at all. Use this for a free-text &quot;anything else&quot; escape-hatch field sharing an env var with <Code>queryParam</Code>-bound fields, so it doesn&apos;t inject a stray space into a combined launch string.</> },
            ]}
          />
          <p className="pt-2 font-medium text-foreground">Examples, one per mechanism</p>
          <CodeBlock>{`bind: { env: SERVER_NAME }                          # plain env var
bind: { env: PVP, trueFalse: true }                 # boolean -> "true"/"false"
bind: { env: ARK_MODS, join: "," }                  # array joined with a separator
bind: { env: SERVER_ARGS, prefix: "-worldseed " }   # e.g. "-worldseed abc123"
bind: { arg: "", ifTrue: "-NoBattlEye" }            # flag only emitted when true
bind: { ini: "ServerSettings.DifficultyOffset" }    # [ServerSettings] DifficultyOffset=...
bind: { json: "visibility.public" }                 # { "visibility": { "public": true } }
bind: { arg: "-MaxPlayers=" }                        # one CLI argument

# ARK-style combined settings string — both fields append into the SAME env var
- key: pve
  bind: { env: EXTRA_SETTINGS, queryParam: ServerPVE }
- key: xpMultiplier
  bind: { env: EXTRA_SETTINGS, queryParam: XPMultiplier }
# → EXTRA_SETTINGS ends up as "?ServerPVE=False?XPMultiplier=2"

# Free-text escape hatch sharing that same env var, no injected space
- key: extraSettings
  type: text
  bind: { env: EXTRA_SETTINGS, rawAppend: true }`}</CodeBlock>
        </Doc>

        <Doc id="showif" title="showIf">
          <RefTable
            columns={["Key", "Description"]}
            rows={[
              { Key: <Code>field</Code>, Description: "The key of another field in the same template whose current value gates visibility." },
              { Key: <Code>equals</Code>, Description: "Show only when that field's value === this." },
              { Key: <Code>notEquals</Code>, Description: "Show only when that field's value !== this. Ignored if equals is also set." },
            ]}
          />
          <p>
            If neither is set, the field shows whenever the referenced value
            is truthy. There&apos;s no support for multi-field or boolean
            (AND/OR) conditions — only one referenced field per{" "}
            <Code>showIf</Code>.
          </p>
          <CodeBlock>{`- key: gameMode
  type: select
  options: [{ value: PvE, label: PvE }, { value: PvP, label: PvP }]

- key: pvpProtectionMode
  type: select
  showIf: { field: gameMode, equals: PvP }`}</CodeBlock>
        </Doc>

        {/* ---------------- Building a template ---------------- */}
        <GroupHeading>Building a template</GroupHeading>

        <Doc id="build-steps" title="Step by step">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Find the Docker image you want to run. Prefer one with a real
              README or a public entrypoint script you can read — you&apos;ll
              need to know exactly which env vars / files it reads.
            </li>
            <li>
              Create <Code>templates/yourgame.yaml</Code> with{" "}
              <Code>id</Code>, <Code>name</Code>, and{" "}
              <Code>runtime.image</Code> at minimum.
            </li>
            <li>
              Add <Code>runtime.ports</Code> and{" "}
              <Code>runtime.volumes</Code> matching what the image exposes/
              expects.
            </li>
            <li>
              Add a handful of <Code>fields</Code> for the settings you
              actually know are real (server name, password, max players) —
              start small.
            </li>
            <li>
              Reload the panel (builtin templates re-sync on every read),
              create a server from it, and confirm each field changes the
              running server before adding more.
            </li>
            <li>
              Layer in <Code>rcon</Code>, <Code>mods</Code>, and{" "}
              <Code>backup</Code> once the basics work.
            </li>
            <li>
              Only set <Code>tested: true</Code> once you&apos;ve verified
              the template end to end.
            </li>
          </ol>
        </Doc>

        <Doc id="example-env" title="Example: an env-var-only image">
          <p>
            The simplest case — every setting is its own environment
            variable, no config file to manage.
          </p>
          <CodeBlock>{`id: examplegame
name: Example Game
description: Example Game dedicated server
tested: false
runtime:
  image: someauthor/examplegame-server
  stopTimeout: 60
  memoryMb: 2048
  cpuLimit: 1
  restartPolicy: unless-stopped
  ports:
    - { key: game, container: 27015, protocol: udp }
    - { key: rcon, container: 27020, protocol: tcp }
  volumes:
    - { key: data, container: /data }
  env:
    TZ: Europe/Lisbon
  backup:
    include: [saves]
rcon:
  enabled: true
  portKey: rcon
  passwordField: rconPassword
  saveCommand: save
fields:
  - key: serverName
    type: string
    group: Server
    label: Server name
    required: true
    default: My Example Server
    bind: { env: SERVER_NAME }
  - key: rconPassword
    type: string
    group: Access
    label: RCON password
    secret: true
    required: true
    default: changeme
    bind: { env: RCON_PASSWORD }
  - key: maxPlayers
    type: number
    group: Server
    label: Max players
    min: 1
    max: 32
    default: 10
    bind: { env: MAX_PLAYERS }`}</CodeBlock>
        </Doc>

        <Doc id="example-ini" title="Example: an image that writes an ini file">
          <p>
            When the image owns a real <Code>GameUserSettings.ini</Code>-style
            file, declare it under <Code>runtime.files</Code> and bind
            individual fields straight into it with <Code>ini:</Code> — you
            get one field per real setting instead of a giant free-text box.
          </p>
          <CodeBlock>{`runtime:
  image: someauthor/examplegame-server
  ports: [{ key: game, container: 7777, protocol: udp }]
  volumes: [{ key: data, container: /data }]
  files:
    - path: Config/ServerSettings.ini
      format: ini
fields:
  - key: difficulty
    type: select
    group: Rules
    label: Difficulty
    default: Normal
    options:
      - { value: Easy, label: Easy }
      - { value: Normal, label: Normal }
      - { value: Hard, label: Hard }
    bind: { ini: "ServerSettings.Difficulty" }
  - key: pvpEnabled
    type: boolean
    group: Rules
    label: PvP enabled
    default: false
    bind: { ini: "ServerSettings.PVPEnabled" }`}</CodeBlock>
        </Doc>

        <Doc id="example-query" title="Example: a combined launch-string image">
          <p>
            Some images (ARK: Survival Ascended is the case that motivated
            this) don&apos;t expose per-setting env vars at all — everything
            beyond a handful of core options is passed as one URL-style
            query string. Use <Code>queryParam</Code> to give each setting
            its own field anyway, and <Code>rawAppend</Code> for a free-text
            escape hatch that shares the same variable safely.
          </p>
          <CodeBlock>{`fields:
  - key: pve
    type: boolean
    group: Rules
    label: PvE mode
    default: false
    bind: { env: EXTRA_SETTINGS, queryParam: ServerPVE }
  - key: xpMultiplier
    type: slider
    group: Rates
    label: XP multiplier
    min: 1
    max: 10
    step: 0.5
    default: 1
    bind: { env: EXTRA_SETTINGS, queryParam: XPMultiplier }
  - key: extraSettings
    type: text
    group: Server
    label: Extra settings (advanced escape hatch)
    default: ""
    advanced: true
    description: "For anything not covered above. ? separated, e.g. ?SomeSetting=True"
    bind: { env: EXTRA_SETTINGS, rawAppend: true }`}</CodeBlock>
          <p>
            With <Code>pve: true</Code> and <Code>xpMultiplier: 2</Code>, this
            produces <Code>EXTRA_SETTINGS=&quot;?ServerPVE=True?XPMultiplier=2&quot;</Code>{" "}
            — and whatever the admin types into the escape-hatch field is
            appended straight after it, with no stray space in the middle of
            the launch string.
          </p>
        </Doc>

        {/* ---------------- Troubleshooting ---------------- */}
        <GroupHeading>Troubleshooting</GroupHeading>

        <Doc id="troubleshooting" title="A field does nothing">
          <p>Work through these in order:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Did the container actually recreate?</strong> Env vars
              and CLI args are only applied at container <em>creation</em> —
              a plain restart reuses whatever was baked in before. Saving
              Config only recreates when the diffed config actually changed;
              use &quot;Recreate container&quot; (Config → Network &amp;
              resources) to force it while testing.
            </li>
            <li>
              <strong>Is the bind path exactly right?</strong> There&apos;s no
              validator — a typo&apos;d env var name or a wrong{" "}
              <Code>Section.Key</Code> for <Code>ini</Code> just silently does
              nothing. Re-check the image&apos;s own docs/entrypoint script
              for the exact spelling and casing.
            </li>
            <li>
              <strong>Does the field target the first ini/json file?</strong>{" "}
              If the template declares two files of the same format, only the
              first one in <Code>files</Code> is actually written to — see
              the warning under{" "}
              <Link href="#volumes-files" className="text-accent hover:underline">
                Volumes &amp; files
              </Link>
              .
            </li>
            <li>
              <strong>Does the image even support this setting?</strong> Pull
              it and read the real entrypoint script:
              <CodeBlock>{`docker pull <image>
docker run --rm --entrypoint sh <image> -c "cat /path/to/entrypoint.sh"`}</CodeBlock>
              This is far more reliable than a stale README, and is how
              several wrong assumptions were caught while building these
              templates.
            </li>
            <li>
              <strong>Is the value actually reaching the file?</strong> Open
              the Files tab and inspect the config file directly after a
              recreate — confirms whether the panel wrote it correctly versus
              the game simply ignoring/overwriting it afterwards.
            </li>
          </ol>
        </Doc>

        <Doc id="lessons" title="Lessons & gotchas">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Verify defaults against the real game, not memory.</strong>{" "}
              Several templates shipped with a <Code>default</Code> that
              didn&apos;t match the game&apos;s actual vanilla default (e.g. a
              PvE toggle defaulted to <Code>true</Code> when the game
              defaults to PvP). Check the image&apos;s own README/entrypoint
              or the game&apos;s official wiki before setting a default —
              never assume a &quot;sensible-sounding&quot; value is the real
              one.
            </li>
            <li>
              <strong>Don&apos;t invent settings.</strong> If you can&apos;t
              find a setting documented for the <em>specific image in
              use</em> — not just &quot;the game in general&quot;, different
              community images support different subsets — leave it out
              rather than guessing an env var name.
            </li>
            <li>
              <strong>One field can be bound to the wrong key entirely</strong>{" "}
              and look fine in the UI while silently doing nothing (or
              something different from its label). This happened with a V
              Rising field whose options/label described one setting but
              whose env var pointed at a completely different, incompatible
              one. Cross-check the bind target against the label, not just
              the default value.
            </li>
            <li>
              Group names become tab labels — keep the set small and stable
              (Server/World/Rules/Access/Maintenance is a common, readable
              split) rather than one group per field.
            </li>
            <li>
              The Config screen injects two fixed tabs alongside a
              template&apos;s own groups: &quot;Network &amp; resources&quot;
              and &quot;RCON&quot;. Avoid naming a field group exactly{" "}
              <Code>network</Code> or <Code>rcon</Code> to prevent visual
              confusion with those.
            </li>
            <li>
              Not every image can be fixed with YAML alone. One template
              turned out to point at a Docker image whose entrypoint
              hardcodes its own maintainer&apos;s server name/password and
              ignores every environment variable entirely — no field binding
              could ever work against it. The only real fix was switching to
              a different, actually-parameterized image.
            </li>
          </ul>
        </Doc>
      </div>
    </div>
  );
}

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "slider"
  | "boolean"
  | "select"
  | "list"
  | "port"
  | "group";

export type FieldOption = { value: string; label: string };

export type FieldBind = {
  env?: string;
  ini?: string;
  json?: string;
  arg?: string;
  join?: string;
  /** Prepended to the value before writing (e.g. "-worldseed "). */
  prefix?: string;
  /** When value is boolean true, write this literal (e.g. "-setkey nomap"). */
  ifTrue?: string;
  /** Format booleans as "true"/"false" instead of "1"/"0" (Docker images). */
  trueFalse?: boolean;
};

export type ShowIf = {
  field: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
};

export type TemplateField = {
  key: string;
  type: FieldType;
  label?: string;
  description?: string;
  group?: string;
  required?: boolean;
  secret?: boolean;
  advanced?: boolean;
  placeholder?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: FieldOption[];
  optionsFrom?: string;
  item?: {
    type: "string" | "object" | "number";
    placeholder?: string;
    fields?: TemplateField[];
  };
  bind?: FieldBind;
  showIf?: ShowIf;
};

export type TemplatePort = {
  key: string;
  container: number;
  protocol: "tcp" | "udp";
  /**
   * When Docker cannot publish ports (broken host iptables) we fall back to
   * host networking and set this env var to the allocated host port so the
   * game listens on the right address.
   */
  listenEnv?: string;
  /**
   * Publish hostPort:hostPort and set listenEnv (if any) in bridge mode too.
   * Needed when the game advertises its listen port (Unreal / Satisfactory).
   */
  matchHost?: boolean;
};

export type TemplateVolume = {
  key: string;
  container: string;
};

export type TemplateFile = {
  path: string;
  format: "ini" | "json" | "env";
};

export type TemplateMods = {
  providers: Array<"thunderstore" | "curseforge" | "steam-workshop">;
  thunderstoreNamespace?: string;
  curseforgeGameId?: number;
  workshopAppId?: number;
  installPath?: string;
  bind?: FieldBind;
};

export type TemplateRcon = {
  enabled: boolean;
  portKey?: string;
  passwordField?: string;
  saveCommand?: string;
};

export type TemplateBackup = {
  /** Paths relative to the server data volume (configs / saves only). */
  include: string[];
  /** Extra path prefixes to skip (always skips steamapps, steamcmd, etc.). */
  exclude?: string[];
  /** Stop the container before archiving (slow). Default: false — RCON save only. */
  stopServer?: boolean;
};

export type GameTemplate = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  runtime: {
    image: string;
    stopTimeout?: number;
    restartPolicy?: string;
    memoryMb?: number;
    cpuLimit?: number;
    env?: Record<string, string>;
    ports: TemplatePort[];
    volumes: TemplateVolume[];
    files?: TemplateFile[];
    user?: string;
    backup?: TemplateBackup;
  };
  rcon?: TemplateRcon;
  mods?: TemplateMods;
  options?: Record<string, FieldOption[]>;
  fields: TemplateField[];
};

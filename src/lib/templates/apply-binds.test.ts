import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { applyBinds } from "./apply-binds";
import type { GameTemplate } from "./types";

function tpl(fields: GameTemplate["fields"]): GameTemplate {
  return {
    id: "t",
    name: "t",
    runtime: { image: "x", ports: [], volumes: [] },
    fields,
  };
}

describe("applyBinds queryParam composition", () => {
  it("composes multiple fields into one ARK-style query string", () => {
    const t = tpl([
      { key: "pve", type: "boolean", bind: { env: "EXTRA_SETTINGS", queryParam: "ServerPVE" } },
      {
        key: "xp",
        type: "slider",
        bind: { env: "EXTRA_SETTINGS", queryParam: "XPMultiplier" },
      },
    ]);
    const dir = mkdtempSync(path.join(tmpdir(), "ophiussa-test-"));
    const { env } = applyBinds(t, { pve: true, xp: 2 }, dir);
    expect(env.EXTRA_SETTINGS).toBe("?ServerPVE=True?XPMultiplier=2");
  });

  it("skips a queryParam field when its value is unset", () => {
    const t = tpl([
      { key: "pve", type: "boolean", bind: { env: "EXTRA_SETTINGS", queryParam: "ServerPVE" } },
    ]);
    const dir = mkdtempSync(path.join(tmpdir(), "ophiussa-test-"));
    const { env } = applyBinds(t, {}, dir);
    expect(env.EXTRA_SETTINGS).toBeUndefined();
  });

  it("rawAppend concatenates onto composed query params with no separator", () => {
    const t = tpl([
      { key: "pve", type: "boolean", bind: { env: "EXTRA_SETTINGS", queryParam: "ServerPVE" } },
      {
        key: "extra",
        type: "text",
        bind: { env: "EXTRA_SETTINGS", rawAppend: true },
      },
    ]);
    const dir = mkdtempSync(path.join(tmpdir(), "ophiussa-test-"));
    const { env } = applyBinds(
      t,
      { pve: false, extra: "?CustomSetting=1" },
      dir,
    );
    expect(env.EXTRA_SETTINGS).toBe("?ServerPVE=False?CustomSetting=1");
  });
});

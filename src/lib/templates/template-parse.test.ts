import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseTemplateYaml } from "@/lib/templates/definition";

describe("template parsing", () => {
  it("parses valheim template yaml", () => {
    const file = path.join(process.cwd(), "templates", "valheim.yaml");
    const raw = readFileSync(file, "utf8");
    const tpl = parseTemplateYaml(raw);
    expect(tpl.id).toBe("valheim");
    expect(tpl.runtime.image).toBeTruthy();
    expect(tpl.runtime.ports.length).toBeGreaterThan(0);
  });

  it("parses generic steam template yaml", () => {
    const file = path.join(process.cwd(), "templates", "steam.yaml");
    const raw = readFileSync(file, "utf8");
    const tpl = parseTemplateYaml(raw);
    expect(tpl.id).toBe("steam");
    expect(tpl.runtime.image).toContain("steamcmd");
    expect(tpl.fields.some((f) => f.key === "gameId")).toBe(true);
    expect(tpl.mods?.providers).toContain("steam-workshop");
  });
});

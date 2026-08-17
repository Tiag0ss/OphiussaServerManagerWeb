import { describe, expect, it } from "vitest";
import { findConsecutiveFreePorts, getUsedHostPorts } from "@/lib/port-alloc";

describe("port-alloc", () => {
  it("finds consecutive free ports in range", () => {
    const used = new Set([25565, 25566]);
    const result = findConsecutiveFreePorts(
      { start: 25565, end: 25570 },
      2,
      used,
    );
    expect(result).toEqual([25567, 25568]);
  });

  it("returns null when block unavailable", () => {
    const used = new Set([25565, 25566, 25567, 25568, 25569, 25570]);
    const result = findConsecutiveFreePorts(
      { start: 25565, end: 25570 },
      2,
      used,
    );
    expect(result).toBeNull();
  });

  it("getUsedHostPorts returns a set", () => {
    expect(getUsedHostPorts()).toBeInstanceOf(Set);
  });
});

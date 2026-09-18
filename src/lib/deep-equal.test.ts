import { describe, expect, it } from "vitest";
import { deepEqual } from "@/lib/deep-equal";

describe("deepEqual", () => {
  it("treats identical primitives as equal", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  it("ignores object key order", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("detects nested differences", () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
  });

  it("compares arrays by position", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("returns false for mismatched shapes", () => {
    expect(deepEqual({ a: 1 }, [1])).toBe(false);
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

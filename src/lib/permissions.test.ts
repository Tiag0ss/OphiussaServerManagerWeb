import { describe, expect, it } from "vitest";
import { canAccessServer } from "@/lib/permissions";
import type { SessionUser } from "@/lib/auth/session";

const admin: SessionUser = {
  id: "admin1",
  email: "admin@test",
  name: "Admin",
  role: "admin",
};

const user: SessionUser = {
  id: "user1",
  email: "user@test",
  name: "User",
  role: "user",
};

describe("permissions", () => {
  it("admin can access any server action", () => {
    expect(canAccessServer(admin, "missing-server", "delete")).toBe(true);
  });

  it("regular user cannot access unknown server", () => {
    expect(canAccessServer(user, "missing-server", "view")).toBe(false);
  });
});

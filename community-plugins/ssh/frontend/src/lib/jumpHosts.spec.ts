import { describe, expect, it } from "vitest";
import { validateJumpHosts, validateJumpHostsText } from "./jumpHosts";

describe("validateJumpHosts", () => {
  it("accepts empty and valid password hops", () => {
    expect(validateJumpHostsText("")).toEqual({ ok: true, hops: [] });
    expect(validateJumpHostsText("[]")).toEqual({ ok: true, hops: [] });
    const ok = validateJumpHostsText(
      '[{"host":"bastion.example.com","port":2202,"username":"ops","password":"jp"}]',
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.hops).toHaveLength(1);
      expect(ok.hops[0].port).toBe(2202);
      expect(ok.hops[0].authentication).toBe("password");
    }
  });

  it("rejects bad JSON, too many hops, and missing credentials", () => {
    expect(validateJumpHostsText("{").ok).toBe(false);
    expect(validateJumpHosts([{ host: "a", username: "u", password: "p" }, { host: "b", username: "u", password: "p" }, { host: "c", username: "u", password: "p" }, { host: "d", username: "u", password: "p" }]).ok).toBe(false);
    expect(validateJumpHosts([{ host: "bastion", username: "ops" }]).ok).toBe(false);
    expect(validateJumpHosts([{ host: "ssh://bastion", username: "ops", password: "x" }]).ok).toBe(false);
  });

  it("rejects repeated host:port hops", () => {
    const result = validateJumpHosts([
      { host: "bastion", port: 22, username: "ops", password: "a" },
      { host: "bastion", port: 22, username: "ops", password: "b" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/repeats/);
  });

  it("requires private_key_path for key auth", () => {
    expect(
      validateJumpHosts([
        { host: "inner", username: "relay", authentication: "private-key" },
      ]).ok,
    ).toBe(false);
    const ok = validateJumpHosts([
      {
        host: "inner",
        username: "relay",
        authentication: "private-key",
        private_key_path: "~/.ssh/id_ed25519",
      },
    ]);
    expect(ok.ok).toBe(true);
  });
});

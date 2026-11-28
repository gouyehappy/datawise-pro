import { describe, expect, it } from "vitest";
import {
  buildPasswordHintCandidates,
  passwordHintOfferKey,
  passwordHintPayload,
  shouldOfferPasswordHint,
} from "./passwordHint";

describe("buildPasswordHintCandidates", () => {
  it("includes connection and profiles that have a password set", () => {
    expect(
      buildPasswordHintCandidates({
        connectionPasswordSet: true,
        connectionLabel: "prod-db",
        profiles: [
          { id: "p1", name: "Ops", sudoPasswordSet: true },
          { id: "p2", name: "Empty", sudoPasswordSet: false },
          { id: "", name: "bad", sudoPasswordSet: true },
        ],
      }),
    ).toEqual([
      { kind: "connection", id: "connection", label: "prod-db" },
      { kind: "profile", id: "p1", label: "Ops" },
    ]);
  });

  it("returns empty when nothing is configured", () => {
    expect(
      buildPasswordHintCandidates({
        connectionPasswordSet: false,
        connectionLabel: "x",
        profiles: [],
      }),
    ).toEqual([]);
  });
});

describe("shouldOfferPasswordHint", () => {
  const candidates = [{ kind: "connection" as const, id: "connection", label: "host" }];

  it("offers on password prompts when enabled with candidates", () => {
    expect(
      shouldOfferPasswordHint({
        enabled: true,
        line: "[sudo] password for alice:",
        candidates,
        busy: false,
        connected: true,
      }),
    ).toBe(true);
  });

  it("stays quiet for bastion menus, when disabled, busy, or empty candidates", () => {
    expect(
      shouldOfferPasswordHint({
        enabled: true,
        line: "Opt> ",
        candidates,
        busy: false,
        connected: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferPasswordHint({
        enabled: false,
        line: "Password:",
        candidates,
        busy: false,
        connected: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferPasswordHint({
        enabled: true,
        line: "Password:",
        candidates,
        busy: true,
        connected: true,
      }),
    ).toBe(false);
    expect(
      shouldOfferPasswordHint({
        enabled: true,
        line: "Password:",
        candidates: [],
        busy: false,
        connected: true,
      }),
    ).toBe(false);
  });
});

describe("passwordHint helpers", () => {
  it("builds a stable offer key and Enter-terminated payload", () => {
    expect(passwordHintOfferKey("Password: ", ["connection", "p1"])).toBe("Password:\0connection,p1");
    expect(passwordHintPayload("s3cret")).toBe("s3cret\r");
  });
});

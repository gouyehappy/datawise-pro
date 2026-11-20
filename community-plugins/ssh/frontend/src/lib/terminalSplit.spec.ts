import { describe, expect, it } from "vitest";
import {
  canOpenTerminalSplit,
  resolveSyncInputTargets,
  sanitizeSplitOrientation,
  sanitizeSyncInputEnabled,
} from "./terminalSplit";

describe("terminalSplit", () => {
  it("sanitizes orientation and sync defaults", () => {
    expect(sanitizeSplitOrientation("horizontal")).toBe("horizontal");
    expect(sanitizeSplitOrientation("vertical")).toBe("vertical");
    expect(sanitizeSplitOrientation(null)).toBe("vertical");
    expect(sanitizeSyncInputEnabled("true")).toBe(true);
    expect(sanitizeSyncInputEnabled("false")).toBe(false);
    expect(sanitizeSyncInputEnabled(null)).toBe(false);
  });

  it("fans out sync targets to primary + split", () => {
    expect(
      resolveSyncInputTargets({
        syncEnabled: true,
        primarySessionId: "a",
        splitSessionId: "b",
        sourceSessionId: "a",
      }),
    ).toEqual(["a", "b"]);
    expect(
      resolveSyncInputTargets({
        syncEnabled: false,
        primarySessionId: "a",
        splitSessionId: "b",
        sourceSessionId: "b",
      }),
    ).toEqual(["b"]);
  });

  it("gates split open on SSH connected primary without an existing split", () => {
    expect(
      canOpenTerminalSplit({
        connected: true,
        primarySessionId: "s1",
        splitSessionId: undefined,
        protocolKind: "ssh",
      }),
    ).toBe(true);
    expect(
      canOpenTerminalSplit({
        connected: true,
        primarySessionId: "s1",
        splitSessionId: "s2",
        protocolKind: "ssh",
      }),
    ).toBe(false);
    expect(
      canOpenTerminalSplit({
        connected: true,
        primarySessionId: "s1",
        splitSessionId: undefined,
        protocolKind: "local",
      }),
    ).toBe(false);
  });
});

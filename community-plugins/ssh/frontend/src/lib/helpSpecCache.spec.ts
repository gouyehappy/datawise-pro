import { describe, expect, it } from "vitest";
import {
  HELP_SPEC_CACHE_KEY,
  HELP_SPEC_CACHE_MAX_BYTES,
  HELP_SPEC_CACHE_MAX_ENTRIES,
  HELP_SPEC_CACHE_VERSION,
  restoreHelpSpecCache,
  serializeHelpSpecCache,
} from "./helpSpecCache";
import { HELP_SPEC_TTL_MS } from "./helpSpecScheduler";
import type { PersistedHelpSpec } from "./helpSpecScheduler";

const NOW = 1_700_000_000_000;
const base: PersistedHelpSpec = {
  key: "session-a",
  command: "jq",
  flags: [
    { flag: "-c, --compact-output", description: "compact instead of pretty" },
    { flag: "-r, --raw-output", description: "output raw strings" },
  ],
  at: NOW - 1_000,
};

describe("serializeHelpSpecCache", () => {
  it("produces a versioned document with only parsed fields", () => {
    const raw = serializeHelpSpecCache([base], NOW);
    expect(raw).not.toBeNull();
    const doc = JSON.parse(raw!);
    expect(doc.v).toBe(HELP_SPEC_CACHE_VERSION);
    expect(doc.entries).toHaveLength(1);
    expect(doc.entries[0].command).toBe("jq");
    expect(doc.entries[0].flags[0].flag).toBe("-c, --compact-output");
    // The raw --help text / any unexpected field never reaches storage.
    expect(raw).not.toContain("Options:");
    expect(Object.keys(doc.entries[0]).sort()).toEqual(["at", "command", "flags", "key"]);
    expect(HELP_SPEC_CACHE_KEY).toBe("dw.ssh.helpSpecCache");
  });

  it("returns null for empty / non-array input", () => {
    expect(serializeHelpSpecCache([], NOW)).toBeNull();
    expect(serializeHelpSpecCache(null, NOW)).toBeNull();
    expect(serializeHelpSpecCache(undefined, NOW)).toBeNull();
  });

  it("refuses blocked commands, stale entries and entries without flags", () => {
    expect(serializeHelpSpecCache([{ ...base, command: "rm" }], NOW)).toBeNull();
    expect(serializeHelpSpecCache([{ ...base, command: "ls; id" }], NOW)).toBeNull();
    expect(serializeHelpSpecCache([{ ...base, at: NOW - HELP_SPEC_TTL_MS }], NOW)).toBeNull();
    expect(serializeHelpSpecCache([{ ...base, at: NOW + 120_000 }], NOW)).toBeNull();
    expect(serializeHelpSpecCache([{ ...base, flags: [] }], NOW)).toBeNull();
  });

  it("strips control characters, bounds fields and redacts secret-like values", () => {
    const raw = serializeHelpSpecCache([{
      ...base,
      key: "s\u0007ession",
      flags: [
        { flag: "--token", description: "token: abc123SECRET" },
        { flag: "x".repeat(500), description: "d".repeat(500) },
      ],
    }], NOW);
    const entry = JSON.parse(raw!).entries[0];
    expect(entry.key).toBe("session");
    expect(entry.flags[0].description).toBe(""); // secret value redacted
    expect(entry.flags[1].flag.length).toBeLessThanOrEqual(64);
    expect(entry.flags[1].description.length).toBeLessThanOrEqual(120);
  });

  it("deduplicates by scope+command, caps entries and trims oversize payloads", () => {
    const many: PersistedHelpSpec[] = Array.from({ length: HELP_SPEC_CACHE_MAX_ENTRIES + 10 }, (_, i) => ({
      key: `s${i}`,
      command: `cmd${i}`,
      flags: [{ flag: "--x", description: "x".repeat(300) }],
      at: NOW - i * 100,
    }));
    const raw = serializeHelpSpecCache(many, NOW);
    const doc = JSON.parse(raw!);
    expect(doc.entries.length).toBeLessThanOrEqual(HELP_SPEC_CACHE_MAX_ENTRIES);
    expect(new TextEncoder().encode(raw!).length).toBeLessThanOrEqual(HELP_SPEC_CACHE_MAX_BYTES);
    const dup = serializeHelpSpecCache([base, { ...base, at: NOW - 5_000 }], NOW);
    expect(JSON.parse(dup!).entries).toHaveLength(1);
    expect(JSON.parse(dup!).entries[0].at).toBe(NOW - 1_000); // newest wins
  });
});

describe("restoreHelpSpecCache", () => {
  it("round-trips a serialized document", () => {
    const raw = serializeHelpSpecCache([base], NOW)!;
    const out = restoreHelpSpecCache(raw, NOW);
    expect(out).toEqual([base]);
  });

  it("fails closed on non-string, corrupt JSON, wrong version and wrong shape", () => {
    expect(restoreHelpSpecCache(null, NOW)).toEqual([]);
    expect(restoreHelpSpecCache("{not json", NOW)).toEqual([]);
    expect(restoreHelpSpecCache("{}", NOW)).toEqual([]);
    expect(restoreHelpSpecCache(JSON.stringify({ v: 999, entries: [base] }), NOW)).toEqual([]);
    expect(restoreHelpSpecCache(JSON.stringify({ v: 1, entries: "nope" }), NOW)).toEqual([]);
    expect(restoreHelpSpecCache("x".repeat(HELP_SPEC_CACHE_MAX_BYTES * 2 + 1), NOW)).toEqual([]);
  });

  it("skips bad entries but keeps the good ones", () => {
    const raw = JSON.stringify({
      v: HELP_SPEC_CACHE_VERSION,
      entries: [
        { ...base, command: "rm" },                      // blocked command
        { ...base, command: "jq2", at: NOW - HELP_SPEC_TTL_MS }, // stale
        { ...base, command: "jq3", flags: "not-array" },
        { ...base, command: "jq4", flags: [{ flag: "", description: "" }] },
        { ...base, command: "jq5" },                    // valid
        "garbage",
      ],
    });
    const out = restoreHelpSpecCache(raw, NOW);
    expect(out.map((e) => e.command)).toEqual(["jq5"]);
  });

  it("deduplicates, caps and orders newest-first", () => {
    const entries = [
      { ...base, command: "a", at: NOW - 5_000 },
      { ...base, command: "a", at: NOW - 1_000 },
      { ...base, command: "b", at: NOW - 2_000 },
    ];
    const out = restoreHelpSpecCache(JSON.stringify({ v: HELP_SPEC_CACHE_VERSION, entries }), NOW);
    expect(out.map((e) => e.command)).toEqual(["a", "b"]);
    expect(out[0].at).toBe(NOW - 1_000);
    const many = Array.from({ length: HELP_SPEC_CACHE_MAX_ENTRIES + 8 }, (_, i) => ({
      ...base, command: `c${i}`, at: NOW - i,
    }));
    expect(restoreHelpSpecCache(JSON.stringify({ v: 1, entries: many }), NOW)).toHaveLength(
      HELP_SPEC_CACHE_MAX_ENTRIES,
    );
  });

  it("restores the scope key so hosts stay isolated", () => {
    const raw = serializeHelpSpecCache([base, { ...base, key: "session-b", command: "curl" }], NOW)!;
    const out = restoreHelpSpecCache(raw, NOW);
    expect(out.map((e) => e.key).sort()).toEqual(["session-a", "session-b"]);
  });
});

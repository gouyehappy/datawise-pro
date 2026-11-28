import { describe, expect, it, vi } from "vitest";
import {
  createHelpSpecScheduler,
  HELP_SPEC_NEGATIVE_TTL_MS,
  HELP_SPEC_TTL_MS,
} from "./helpSpecScheduler";

const HELP = "Options:\n  -q, --quiet   suppress output\n  -v, --verbose  verbose\n";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createHelpSpecScheduler", () => {
  it("refuses unvalidated commands without calling run", async () => {
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run });
    expect(await scheduler.load("s1", "rm")).toBeNull();
    expect(await scheduler.load("s1", "ls; id")).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.size).toBe(0);
  });

  it("parses, caches, and serves a successful result within the TTL", async () => {
    let clock = 1_000;
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run, now: () => clock });

    const first = await scheduler.load("session-a", "jq");
    expect(first?.flags.map((f) => f.flag)).toEqual(["-q, --quiet", "-v, --verbose"]);
    expect(scheduler.peek("session-a", "jq")?.command).toBe("jq");
    expect(run).toHaveBeenCalledTimes(1);

    clock += HELP_SPEC_TTL_MS - 1;
    expect(await scheduler.load("session-a", "jq")).not.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);

    clock += 2;
    expect(await scheduler.load("session-a", "jq")).not.toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("isolates scopes by key", async () => {
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run, now: () => 0 });
    await scheduler.load("host-1", "jq");
    await scheduler.load("host-2", "jq");
    expect(run).toHaveBeenCalledTimes(2);
    expect(scheduler.size).toBe(2);
  });

  it("negative-caches empty output and thrown errors", async () => {
    let clock = 0;
    const run = vi.fn(async () => null as string | null);
    const scheduler = createHelpSpecScheduler({ run, now: () => clock });
    expect(await scheduler.load("s", "jq")).toBeNull();
    clock += HELP_SPEC_NEGATIVE_TTL_MS - 1;
    expect(await scheduler.load("s", "jq")).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect(scheduler.peek("s", "jq")).toBeNull();

    const throwing = createHelpSpecScheduler({
      run: async () => {
        throw new Error("host unreachable");
      },
      now: () => 0,
    });
    expect(await throwing.load("s", "yq")).toBeNull();
    expect(throwing.size).toBe(1);
  });

  it("shares one in-flight request for the same key", async () => {
    const gate = deferred<string | null>();
    const run = vi.fn(() => gate.promise);
    const scheduler = createHelpSpecScheduler({ run, now: () => 0 });
    const a = scheduler.load("s", "jq");
    const b = scheduler.load("s", "jq");
    expect(scheduler.inFlight).toBe(1);
    expect(run).toHaveBeenCalledTimes(1);
    gate.resolve(HELP);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).not.toBeNull();
    expect(rb).not.toBeNull();
    expect(scheduler.inFlight).toBe(0);
  });

  it("fails closed (no queueing) when the concurrency cap is reached", async () => {
    const gate = deferred<string | null>();
    const run = vi.fn(() => gate.promise);
    const scheduler = createHelpSpecScheduler({ run, now: () => 0, maxInFlight: 1 });
    const first = scheduler.load("s", "jq");
    const second = await scheduler.load("s", "yq");
    expect(second).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    gate.resolve(HELP);
    expect(await first).not.toBeNull();
  });

  it("evicts the oldest entry at the cache bound", async () => {
    let clock = 0;
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run, now: () => clock, maxEntries: 2 });
    await scheduler.load("s", "jq");
    clock += 1;
    await scheduler.load("s", "yq");
    clock += 1;
    await scheduler.load("s", "zq");
    expect(scheduler.size).toBe(2);
    expect(scheduler.peek("s", "jq")).toBeUndefined();
    expect(scheduler.peek("s", "zq")).not.toBeUndefined();
  });

  it("clear() drops the cache and invalidates in-flight results", async () => {
    const gate = deferred<string | null>();
    const scheduler = createHelpSpecScheduler({ run: () => gate.promise, now: () => 0 });
    const pending = scheduler.load("s", "jq");
    scheduler.clear();
    gate.resolve(HELP);
    expect(await pending).toBeNull();
    expect(scheduler.size).toBe(0);
  });
});

describe("snapshot / seed (beta.44 persistence bridge)", () => {
  it("snapshots only successful entries together with their scope key", async () => {
    const run = vi.fn(async (cmd: string) => (cmd === "yq" ? null : HELP));
    const scheduler = createHelpSpecScheduler({ run, now: () => 1_000 });
    await scheduler.load("host-a", "jq");
    await scheduler.load("host-b", "yq"); // negative cache, must not be persisted
    const snap = scheduler.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].key).toBe("host-a");
    expect(snap[0].command).toBe("jq");
    expect(snap[0].flags.length).toBeGreaterThan(0);
    expect(snap[0].at).toBe(1_000);
  });

  it("seeds valid entries and refuses blocked / empty / stale ones", async () => {
    const NOW = 500_000;
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run, now: () => NOW });
    scheduler.seed([
      { key: "host-a", command: "jq", flags: [{ flag: "--x", description: "x" }], at: NOW - 1_000 },
      { key: "host-a", command: "rm", flags: [{ flag: "--x", description: "x" }], at: NOW - 1_000 },
      { key: "host-a", command: "yq", flags: [], at: NOW - 1_000 },
      { key: "host-a", command: "zq", flags: [{ flag: "--x", description: "x" }], at: NOW - HELP_SPEC_TTL_MS },
    ]);
    expect(scheduler.size).toBe(1);
    expect(await scheduler.load("host-a", "jq")).not.toBeNull();
    expect(run).not.toHaveBeenCalled(); // served from the seeded cache
    expect(scheduler.peek("host-a", "rm")).toBeUndefined();
  });

  it("clear() then seed() restores cross-reload entries", async () => {
    const run = vi.fn(async () => HELP);
    const scheduler = createHelpSpecScheduler({ run, now: () => 1_000 });
    await scheduler.load("s", "jq");
    const snap = scheduler.snapshot();
    scheduler.clear();
    expect(scheduler.peek("s", "jq")).toBeUndefined();
    scheduler.seed(snap);
    expect(await scheduler.load("s", "jq")).not.toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

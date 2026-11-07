import { describe, expect, it } from "vitest";
import {
  clearPathDirCache,
  cwdFromShellPrompt,
  expandTildePath,
  itemsFromListing,
  pathCompletionSlots,
  resolvePathCompletionCwd,
  runPathCompletion,
  scorePathName,
  splitPathToken,
} from "./pathGenerator";

describe("path generator", () => {
  it("prefers terminal cwd over SFTP path and does not invent root", () => {
    expect(resolvePathCompletionCwd("/home/demo", "/var/www")).toBe("/home/demo");
    expect(resolvePathCompletionCwd("", "/var/www")).toBe("/var/www");
    expect(resolvePathCompletionCwd("  ", "")).toBe("");
    // SFTP panel default `/` without shell OSC cwd is not trusted.
    expect(resolvePathCompletionCwd("", "/")).toBe("");
  });

  it("does not list root bin/boot for relative tokens when cwd is unknown", () => {
    expect(pathCompletionSlots(
      { line: "tail -200f b", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "",
    )).toEqual([]);
    expect(pathCompletionSlots(
      { line: "tail -200f b", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/data/logs/bi-apigw",
    )).toHaveLength(1);
    // Absolute paths still work without cwd.
    expect(pathCompletionSlots(
      { line: "tail -200f /et", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "",
    )).toHaveLength(1);
  });

  it("scrapes cwd from a classic user@host:/path# prompt", () => {
    expect(cwdFromShellPrompt("root@k8s-121:/data/logs/bi-apigw# tail -200f b")).toBe("/data/logs/bi-apigw");
    expect(cwdFromShellPrompt("root@k8s-121:/data/logs/bi-apigw# ")).toBe("/data/logs/bi-apigw");
    expect(cwdFromShellPrompt("/var/log$ ls ")).toBe("/var/log");
    expect(cwdFromShellPrompt("no prompt here")).toBe("");
  });

  it("splits relative and absolute tokens against cwd", () => {
    expect(splitPathToken("etc/ho", "/")).toEqual({ dir: "/etc", prefix: "ho" });
    expect(splitPathToken("/var/log/", "/home")).toEqual({ dir: "/var/log", prefix: "" });
    expect(splitPathToken("src", "/home/demo")).toEqual({ dir: "/home/demo", prefix: "src" });
  });

  it("expands ~user paths", () => {
    expect(expandTildePath("~alice/bin")).toBe("/home/alice/bin");
    expect(splitPathToken("~bob/sc", "/")).toEqual({ dir: "/home/bob", prefix: "sc" });
  });

  it("opens a slot for cd / ls path tokens", () => {
    const slots = pathCompletionSlots({ line: "cd /etc/h", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" }, "/");
    expect(slots).toHaveLength(1);
    expect((slots[0].payload as { dir: string; prefix: string }).dir).toBe("/etc");
    expect((slots[0].payload as { prefix: string }).prefix).toBe("h");
  });

  it("does not open while the path leaf is still empty", () => {
    expect(pathCompletionSlots(
      { line: "cd ", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/home",
    )).toEqual([]);
    expect(pathCompletionSlots(
      { line: "cd /", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/",
    )).toEqual([]);
    expect(pathCompletionSlots(
      { line: "ls /var/", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/",
    )).toEqual([]);
  });

  it("does not open on bare trailing space for non-path commands", () => {
    const slots = pathCompletionSlots(
      { line: "curl --get ", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/",
    );
    expect(slots).toEqual([]);
  });

  it("opens for file-like option args when a Fig manifest is provided", () => {
    const manifest = {
      curl: {
        name: "curl",
        options: [{ name: ["-K", "--config"], args: { name: "file", template: "filepaths" } }],
      },
    };
    // Empty leaf after `--config ` stays closed; open once a basename is typed.
    expect(pathCompletionSlots(
      { line: "curl --config ", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/home",
      manifest,
    )).toEqual([]);
    const slots = pathCompletionSlots(
      { line: "curl --config /et", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/home",
      manifest,
    );
    expect(slots).toHaveLength(1);
    expect((slots[0].payload as { dir: string; prefix: string }).dir).toBe("/");
    expect((slots[0].payload as { prefix: string }).prefix).toBe("et");
  });

  it("filters listing by prefix", () => {
    const items = itemsFromListing(
      [
        { name: "hosts", kind: "file" },
        { name: "httpd", kind: "directory" },
        { name: "passwd", kind: "file" },
      ],
      { dir: "/etc", prefix: "h", tokenHead: "/etc/", replaceStart: 3, replaceEnd: 8 },
    );
    expect(items.map((i) => i.label)).toEqual(["hosts", "httpd"]);
    expect(items[1].kind).toBe("directory");
    expect(items[0].edit.text).toBe("/etc/hosts");
    expect(items[1].edit.text).toBe("/etc/httpd/");
  });

  it("requires a typed leaf and rejects weak fuzzy hits like Default", () => {
    expect(scorePathName("", "Default")).toBeNull();
    expect(scorePathName("l", "Default")).toBeNull();
    expect(scorePathName("da", "Default")).toBeNull();
    expect(scorePathName("dat", "Default")).toBeNull();
    expect(scorePathName("De", "Default")).not.toBeNull();
    expect(itemsFromListing(
      [{ name: "Default", kind: "directory" }, { name: "favorite", kind: "directory" }],
      { dir: "/", prefix: "", tokenHead: "/", replaceStart: 3, replaceEnd: 4 },
    )).toEqual([]);
    expect(itemsFromListing(
      [{ name: "Default", kind: "directory" }, { name: "logs", kind: "directory" }],
      { dir: "/data", prefix: "l", tokenHead: "/data/", replaceStart: 8, replaceEnd: 9 },
    ).map((i) => i.label)).toEqual(["logs"]);
  });

  it("fuzzy-matches path basenames (bid → bi-datax*)", () => {
    const items = itemsFromListing(
      [
        { name: "bi-apigw", kind: "directory" },
        { name: "bi-datax-flink", kind: "directory" },
        { name: "bi-datax-import", kind: "directory" },
        { name: "other", kind: "directory" },
      ],
      { dir: "/data/logs", prefix: "bid", tokenHead: "/data/logs/", replaceStart: 3, replaceEnd: 16 },
    );
    expect(items.map((i) => i.label)).toEqual(
      expect.arrayContaining(["bi-datax-flink", "bi-datax-import"]),
    );
    expect(items.map((i) => i.label)).not.toContain("other");
    // Prefix `bi` still lists all bi-* before weaker fuzzy noise.
    const bi = itemsFromListing(
      [
        { name: "bi-apigw", kind: "directory" },
        { name: "bi-datax-flink", kind: "directory" },
      ],
      { dir: "/data/logs", prefix: "bi", tokenHead: "/data/logs/", replaceStart: 0, replaceEnd: 0 },
    );
    expect(bi[0]?.label.startsWith("bi")).toBe(true);
  });

  it("keeps relative path head when accepting a basename match (cd data/log → data/logs/)", () => {
    const slots = pathCompletionSlots(
      { line: "cd data/log", requestId: 1, revision: 1, sessionId: "s", trigger: "typing" },
      "/home",
    );
    expect(slots).toHaveLength(1);
    const payload = slots[0].payload as { dir: string; prefix: string; tokenHead: string; replaceStart: number; replaceEnd: number };
    expect(payload.prefix).toBe("log");
    expect(payload.tokenHead).toBe("data/");
    expect(payload.replaceStart).toBe(3);
    expect(payload.replaceEnd).toBe(11);

    const items = itemsFromListing([{ name: "logs", kind: "directory" }], payload);
    expect(items[0]?.edit.text).toBe("data/logs/");
  });

  it("caches directory listings and falls back to parent on miss", async () => {
    clearPathDirCache();
    const calls: string[] = [];
    const listDir = async (path: string) => {
      calls.push(path);
      if (path === "/missing") return null;
      if (path === "/") return [{ name: "missing-data", kind: "directory" }, { name: "tmp", kind: "directory" }];
      return [{ name: "hosts", kind: "file" }];
    };
    const slot = {
      command: "cat",
      commandPath: ["cat"],
      tokenStart: 0,
      tokenEnd: 0,
      payload: { dir: "/etc", prefix: "h", tokenHead: "/etc/", replaceStart: 4, replaceEnd: 5, cacheKey: "s1" },
    };
    const first = await runPathCompletion(slot, listDir);
    const second = await runPathCompletion(slot, listDir);
    expect(first?.map((i) => i.label)).toEqual(["hosts"]);
    expect(second?.map((i) => i.label)).toEqual(["hosts"]);
    expect(calls.filter((p) => p === "/etc")).toHaveLength(1);

    // Child leaf already typed (`/missing/x`): do not invent root hits.
    const missChild = await runPathCompletion({
      ...slot,
      payload: { dir: "/missing", prefix: "x", tokenHead: "/missing/", replaceStart: 0, replaceEnd: 0, cacheKey: "s1" },
    }, listDir);
    expect(missChild).toBeNull();

    // Incomplete directory name with empty child leaf may still recover from parent.
    const missDir = await runPathCompletion({
      ...slot,
      payload: { dir: "/missing", prefix: "", tokenHead: "/", replaceStart: 0, replaceEnd: 0, cacheKey: "s1" },
    }, listDir);
    expect(missDir?.map((i) => i.label)).toEqual(["missing-data"]);
  });
});

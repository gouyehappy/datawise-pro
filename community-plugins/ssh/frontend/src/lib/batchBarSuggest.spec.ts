import { describe, expect, it } from "vitest";
import { buildBatchSuggestItems, highlightBatchSuggestText } from "./batchBarSuggest";
import type { QuickCommand } from "./quickCommands";

const QUICK: QuickCommand[] = [
  { id: "1", name: "getpods", command: "kubectl get pods -A" },
  { id: "2", name: "docker ps", command: "docker ps -a" },
];

describe("buildBatchSuggestItems", () => {
  it("lists quick commands before unmatched history", () => {
    const items = buildBatchSuggestItems({
      quick: QUICK,
      historyCommands: ["uptime", "kubectl get pods -A", "df -h"],
      query: "",
      limit: 10,
    });
    expect(items.map((i) => i.id)).toEqual([
      "quick:1",
      "quick:2",
      "history:uptime",
      "history:df -h",
    ]);
  });

  it("filters both sources by the draft query", () => {
    const items = buildBatchSuggestItems({
      quick: QUICK,
      historyCommands: ["docker logs x", "uptime"],
      query: "docker",
    });
    expect(items.map((i) => i.command)).toEqual(["docker ps -a", "docker logs x"]);
  });

  it("respects the limit", () => {
    const history = Array.from({ length: 20 }, (_, i) => `cmd-${i}`);
    expect(buildBatchSuggestItems({ quick: [], historyCommands: history, query: "", limit: 5 })).toHaveLength(5);
  });
});

describe("highlightBatchSuggestText", () => {
  it("marks the first case-insensitive hit", () => {
    expect(highlightBatchSuggestText("kubectl get pods", "GET")).toEqual([
      { text: "kubectl ", matched: false },
      { text: "get", matched: true },
      { text: " pods", matched: false },
    ]);
  });

  it("returns plain text when there is no hit", () => {
    expect(highlightBatchSuggestText("uptime", "zzz")).toEqual([{ text: "uptime", matched: false }]);
  });
});

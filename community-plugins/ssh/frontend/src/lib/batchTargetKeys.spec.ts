import { describe, expect, it } from "vitest";
import { resolveBatchTargetKey } from "./batchTargetKeys";

describe("resolveBatchTargetKey", () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

  it("maps navigate / toggle / select / close", () => {
    expect(resolveBatchTargetKey({ ...base, key: "ArrowDown" })).toEqual({ action: "move", delta: 1 });
    expect(resolveBatchTargetKey({ ...base, key: "ArrowUp" })).toEqual({ action: "move", delta: -1 });
    expect(resolveBatchTargetKey({ ...base, key: " " })).toEqual({ action: "toggle" });
    expect(resolveBatchTargetKey({ ...base, key: "a", ctrlKey: true })).toEqual({ action: "select-all" });
    expect(resolveBatchTargetKey({ ...base, key: "c", ctrlKey: true, shiftKey: true })).toEqual({
      action: "select-connected",
    });
    expect(resolveBatchTargetKey({ ...base, key: "Escape" })).toEqual({ action: "close" });
    expect(resolveBatchTargetKey({ ...base, key: "Enter" })).toEqual({ action: "close" });
  });
});

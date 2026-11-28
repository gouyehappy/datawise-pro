import { describe, expect, it } from "vitest";
import {
  groupedVisibleRailItems,
  moveRailItem,
  RIGHT_RAIL_DEFAULT_ORDER,
  sanitizeRightToolRailPrefs,
  toggleRailItemHidden,
  visibleRailItems,
} from "./rightToolRailPrefs";

describe("rightToolRailPrefs", () => {
  it("fills missing ids and drops unknown ones", () => {
    const prefs = sanitizeRightToolRailPrefs({
      order: ["copilot", "nope", "monitor"],
      hidden: ["docker", "nope"],
    });
    expect(prefs.order[0]).toBe("copilot");
    expect(prefs.order[1]).toBe("monitor");
    expect(prefs.order).toContain("recordings");
    expect(prefs.order).toHaveLength(RIGHT_RAIL_DEFAULT_ORDER.length);
    expect(prefs.hidden).toEqual(["docker"]);
  });

  it("orders visible items and groups with separators", () => {
    const prefs = sanitizeRightToolRailPrefs({
      order: ["otp", "monitor", "command"],
      hidden: ["monitor"],
    });
    expect(visibleRailItems(prefs)).toEqual(
      prefs.order.filter((id) => id !== "monitor"),
    );
    const groups = groupedVisibleRailItems(prefs);
    // Groups follow default Motty membership; order only sorts inside a group.
    expect(groups[0]).toEqual(["copilot"]);
    expect(groups.some((group) => group.includes("otp"))).toBe(true);
    expect(groups.some((group) => group.includes("command"))).toBe(true);
    expect(groups.every((group) => !group.includes("monitor"))).toBe(true);
  });

  it("moves and toggles hidden", () => {
    const order = moveRailItem(["a", "b", "c"] as never, "b" as never, -1);
    expect(order[0]).toBe("b");
    expect(toggleRailItemHidden(["docker"], "docker")).toEqual([]);
    expect(toggleRailItemHidden([], "docker")).toEqual(["docker"]);
  });
});

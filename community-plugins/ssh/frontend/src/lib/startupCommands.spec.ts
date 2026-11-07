import { describe, expect, it } from "vitest";
import {
  canAddStartupCommand,
  emptyStartupBucket,
  mergeStartupStore,
  sanitizeStartupBucket,
  STARTUP_COMMANDS_LIMIT,
} from "./startupCommands";

describe("startupCommands", () => {
  it("sanitizes rows and drops empties", () => {
    const bucket = sanitizeStartupBucket({
      enabled: true,
      commands: [
        { command: "cd /tmp\r\n", delayMs: 10 },
        { command: "  ", enabled: true },
        { command: "uptime", enabled: false, delayMs: 99_999 },
      ],
    });
    expect(bucket).toEqual({
      enabled: true,
      commands: [
        { command: "cd /tmp", delayMs: 10, enabled: true },
        { command: "uptime", delayMs: 30_000, enabled: false },
      ],
    });
  });

  it("caps the list and merges by connection id", () => {
    const many = Array.from({ length: STARTUP_COMMANDS_LIMIT + 5 }, (_, i) => ({
      command: `echo ${i}`,
      delayMs: 0,
      enabled: true,
    }));
    const bucket = sanitizeStartupBucket({ enabled: true, commands: many });
    expect(bucket.commands).toHaveLength(STARTUP_COMMANDS_LIMIT);
    expect(canAddStartupCommand(bucket)).toBe(false);
    expect(canAddStartupCommand(emptyStartupBucket())).toBe(true);

    const store = mergeStartupStore({ other: { enabled: false, commands: [] } }, "conn-a", bucket);
    expect(store["conn-a"].commands).toHaveLength(STARTUP_COMMANDS_LIMIT);
    expect(store.other.enabled).toBe(false);
  });
});

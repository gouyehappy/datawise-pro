import { describe, expect, it } from "vitest";
import {
  createSessionTransportReuseState,
  fallbackToFreshTransport,
  markSessionTransportOpenSucceeded,
  sessionTransportOpenParams,
} from "./sessionTransportReuse";

describe("sessionTransportReuse", () => {
  it("reads reuse flags and spawn command from host context", () => {
    const state = createSessionTransportReuseState({
      reuseAuthenticatedTransport: true,
      reuseAuthenticatedSessionId: " sess-1 ",
      spawnCommand: "  htop  ",
    });
    expect(state).toEqual({
      reuseAuthenticatedTransport: true,
      reuseAuthenticatedSessionId: " sess-1 ",
      spawnCommand: "  htop  ",
    });
    expect(sessionTransportOpenParams(state)).toEqual({
      reuseAuthenticatedTransport: true,
      reuseAuthenticatedSessionId: " sess-1 ",
      spawnCommand: "  htop  ",
    });
  });

  it("ignores source id when reuse is off", () => {
    const state = createSessionTransportReuseState({
      reuseAuthenticatedTransport: false,
      reuseAuthenticatedSessionId: "sess-1",
      spawnCommand: "uptime",
    });
    expect(sessionTransportOpenParams(state)).toEqual({
      reuseAuthenticatedTransport: false,
      reuseAuthenticatedSessionId: undefined,
      spawnCommand: "uptime",
    });
  });

  it("consumes reuse flags after a successful open", () => {
    const state = createSessionTransportReuseState({
      reuseAuthenticatedTransport: true,
      reuseAuthenticatedSessionId: "old",
      spawnCommand: "htop",
    });
    markSessionTransportOpenSucceeded(state, "new-session");
    expect(state.reuseAuthenticatedTransport).toBe(false);
    expect(state.reuseAuthenticatedSessionId).toBe("new-session");
    expect(state.spawnCommand).toBeUndefined();
  });

  it("falls back to a fresh transport only once", () => {
    const state = createSessionTransportReuseState({
      reuseAuthenticatedTransport: true,
      reuseAuthenticatedSessionId: "sess-1",
    });
    expect(fallbackToFreshTransport(state)).toBe(true);
    expect(state.reuseAuthenticatedTransport).toBe(false);
    expect(state.reuseAuthenticatedSessionId).toBeUndefined();
    expect(fallbackToFreshTransport(state)).toBe(false);
  });
});

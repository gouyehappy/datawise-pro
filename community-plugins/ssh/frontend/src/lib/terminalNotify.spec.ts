import { describe, expect, it, vi } from "vitest";
import {
  createNotifyRateLimiter,
  parseOsc777Notify,
  parseOsc9Notify,
  sanitizeNotifyText,
} from "./terminalNotify";

describe("sanitizeNotifyText", () => {
  it("strips controls and clamps length", () => {
    expect(sanitizeNotifyText("a\u0000b\nc", 10)).toBe("abc");
    expect(sanitizeNotifyText("hello", 3)).toBe("hel");
  });
});

describe("parseOsc9Notify", () => {
  it("returns a body-only notification", () => {
    expect(parseOsc9Notify("build done")).toEqual({
      title: "",
      body: "build done",
      source: "osc9",
    });
  });

  it("rejects empty payloads", () => {
    expect(parseOsc9Notify("")).toBeNull();
    expect(parseOsc9Notify("\u0000")).toBeNull();
  });
});

describe("parseOsc777Notify", () => {
  it("parses notify;title;body", () => {
    expect(parseOsc777Notify("notify;Deploy;finished ok")).toEqual({
      title: "Deploy",
      body: "finished ok",
      source: "osc777",
    });
  });

  it("keeps extra semicolons in the body", () => {
    expect(parseOsc777Notify("notify;T;a;b;c")?.body).toBe("a;b;c");
  });

  it("ignores non-notify subcommands", () => {
    expect(parseOsc777Notify("set;foo")).toBeNull();
  });
});

describe("createNotifyRateLimiter", () => {
  it("allows the first call then blocks until the interval elapses", () => {
    vi.useFakeTimers();
    const limiter = createNotifyRateLimiter(2000);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(limiter.allow()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(limiter.allow()).toBe(true);
    vi.useRealTimers();
  });
});

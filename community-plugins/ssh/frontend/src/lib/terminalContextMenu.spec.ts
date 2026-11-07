import { describe, expect, it } from "vitest";
import { extractHttpUrl } from "./terminalContextMenu";

describe("extractHttpUrl", () => {
  it("returns the first http(s) URL", () => {
    expect(extractHttpUrl("see https://example.com/path and more")).toBe("https://example.com/path");
    expect(extractHttpUrl("http://localhost:8080/x")).toBe("http://localhost:8080/x");
  });

  it("strips trailing punctuation from wrapped lines", () => {
    expect(extractHttpUrl("(https://example.com/docs).")).toBe("https://example.com/docs");
  });

  it("returns null when no URL is present", () => {
    expect(extractHttpUrl("no link here")).toBeNull();
    expect(extractHttpUrl("")).toBeNull();
  });
});

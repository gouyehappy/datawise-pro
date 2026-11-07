import { describe, expect, it } from "vitest";
import { parseDockerPsOutput, sanitizeContainerRef } from "./dockerContainers";

describe("sanitizeContainerRef", () => {
  it("accepts docker ids and names", () => {
    expect(sanitizeContainerRef("web_1")).toBe("web_1");
    expect(sanitizeContainerRef("abc.def-9")).toBe("abc.def-9");
  });

  it("rejects shell metacharacters", () => {
    expect(sanitizeContainerRef(";rm -rf /")).toBeNull();
    expect(sanitizeContainerRef("web;id")).toBeNull();
    expect(sanitizeContainerRef("a b")).toBeNull();
    expect(sanitizeContainerRef("-n")).toBeNull();
    expect(sanitizeContainerRef("")).toBeNull();
  });
});

describe("parseDockerPsOutput", () => {
  it("reads json lines and skips junk", () => {
    const output = [
      `{"ID":"a1b2c3d4e5f6","Names":"web","Image":"nginx","State":"running","Status":"Up 2 days"}`,
      "password:",
      `{"ID":"bad;id","Names":"x"}`,
      `{"ID":"deadbeef0123","Names":"/db,db-alias","Image":"postgres","State":"exited","Status":"Exited (0)"}`,
    ].join("\n");
    const rows = parseDockerPsOutput(output);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "web", running: true, image: "nginx" });
    expect(rows[1]).toMatchObject({ name: "db", running: false });
  });
});

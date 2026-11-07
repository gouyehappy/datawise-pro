import { describe, expect, it } from "vitest";
import appSource from "./App.vue?raw";

describe("SSH host-key challenge protocol", () => {
  it("routes plugin challenges through the standard connection/challenge contract", () => {
    expect(appSource).toContain('event.method === "connection/challenge"');
    expect(appSource).not.toContain("ssh/host-key/prompt");
    expect(appSource).toMatch(/window\.datawisePlugin\.invoke\("connection\/challenge\/resolve"/);
  });

  it("does not resolve plugin challenges through the host SSH prompt endpoint", () => {
    expect(appSource).not.toContain("/api/ssh/prompts/resolve");
  });
});

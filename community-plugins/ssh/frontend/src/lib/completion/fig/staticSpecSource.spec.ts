import { describe, expect, it } from "vitest";
import { resolveStaticFigLine } from "./staticSpecSource";

const curlSpec = {
  name: "curl",
  description: "Transfer a URL",
  options: [
    { name: ["-a", "--append"], description: "Append to target file when uploading" },
    { name: ["-E", "--cert"], description: "Client certificate file and password", args: { name: "certificate" } },
    { name: "--cacert", description: "CA certificate to verify peer against", args: { name: "file" } },
    { name: "--cookie-jar", description: "Write cookies to <filename> after operation", args: { name: "filename" } },
  ],
};

const gitSpec = {
  name: "git",
  subcommands: [
    { name: "status", description: "Show the working tree status" },
    { name: "checkout", description: "Switch branches or restore files", options: [{ name: "-b", description: "Create a new branch" }] },
  ],
};

const manifest = { curl: curlSpec, git: gitSpec };

describe("staticFigSource", () => {
  it("lists curl flags with descriptions after a space", () => {
    const response = resolveStaticFigLine("curl ", manifest, 1, 1);
    expect(response?.state).toBe("ready");
    expect(response?.items.some((i) => i.label === "--cacert" && i.description?.includes("CA certificate"))).toBe(true);
    expect(response?.items.some((i) => i.kind === "option")).toBe(true);
  });

  it("filters curl flags by prefix", () => {
    const response = resolveStaticFigLine("curl --ca", manifest, 1, 1);
    const labels = response?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("--cacert");
    expect(labels.every((l) => l.startsWith("--ca"))).toBe(true);
  });

  it("lists git subcommands", () => {
    const response = resolveStaticFigLine("git ", manifest, 1, 1);
    expect(response?.items.map((i) => i.label)).toEqual(expect.arrayContaining(["status", "checkout"]));
  });

  it("does not open while typing the command name alone", () => {
    expect(resolveStaticFigLine("cur", manifest, 1, 1)).toBeNull();
    expect(resolveStaticFigLine("curl", manifest, 1, 1)).toBeNull();
  });

  it("hides boolean flags already on the line after a trailing space", () => {
    const response = resolveStaticFigLine("curl --append ", manifest, 1, 1);
    const labels = response?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("--append");
    expect(labels).not.toContain("-a");
    expect(labels).toContain("--cacert");
  });

  it("hides multi-char short flags like -it once typed (not only -i)", () => {
    const docker = {
      name: "docker",
      subcommands: [{
        name: "exec",
        options: [
          { name: "-it", description: "Launch an interactive session" },
          { name: ["-i", "--interactive"], description: "Keep STDIN open" },
          { name: ["-e", "--env"], description: "Set env", args: { name: "list" } },
        ],
      }],
    };
    const withDocker = { ...manifest, docker };
    const afterSpace = resolveStaticFigLine("docker exec -it ", withDocker, 1, 1);
    const labels = afterSpace?.items.map((i) => i.label) ?? [];
    expect(labels).not.toContain("-it");
    expect(labels).not.toContain("-i");
    expect(labels).not.toContain("--interactive");
    expect(labels).toContain("--env");

    // Exact typed token with no trailing space: do not re-offer the same flag.
    const exact = resolveStaticFigLine("docker exec -it", withDocker, 1, 1);
    expect(exact?.items.some((i) => i.label === "-it")).toBeFalsy();
  });

  it("keeps options that take args (often repeatable) after their value is filled", () => {
    const response = resolveStaticFigLine("curl --cert foo.pem ", manifest, 1, 1);
    const labels = response?.items.map((i) => i.label) ?? [];
    expect(labels).toContain("--cert");
  });

  it("enters value mode after an option that takes an arg (no flag re-list)", () => {
    const pending = resolveStaticFigLine("curl --cert ", manifest, 1, 1);
    expect(pending?.items.every((i) => i.kind !== "option")).toBe(true);
    // Path-like cert arg → empty static list (path generator owns the menu).
    expect(pending?.items).toEqual([]);

    const config = {
      ...manifest,
      curl: {
        ...curlSpec,
        options: [
          ...curlSpec.options,
          { name: "--url", description: "URL", args: { name: "URL", template: "history" } },
        ],
      },
    };
    const urlPending = resolveStaticFigLine("curl --url ", config, 1, 1);
    expect(urlPending?.items[0]?.kind).toBe("hint");
    expect(urlPending?.items[0]?.label).toContain("URL");
  });

  it("renders args.suggestions in value mode and for positionals", () => {
    const kubectl = {
      name: "kubectl",
      subcommands: [{
        name: "get",
        args: { name: "resource", suggestions: ["pods", "nodes"] },
        options: [
          { name: ["-o", "--output"], args: { name: "format", suggestions: ["wide", "yaml"] } },
        ],
      }],
    };
    const withKubectl = { ...manifest, kubectl };
    const resources = resolveStaticFigLine("kubectl get ", withKubectl, 1, 1);
    expect(resources?.items.map((i) => i.label)).toEqual(expect.arrayContaining(["pods", "nodes"]));

    const formats = resolveStaticFigLine("kubectl get pods -o ", withKubectl, 1, 1);
    expect(formats?.items.map((i) => i.label)).toEqual(expect.arrayContaining(["wide", "yaml"]));
    expect(formats?.items.every((i) => i.kind !== "option")).toBe(true);

    const equals = resolveStaticFigLine("kubectl get pods -o=ya", withKubectl, 1, 1);
    expect(equals?.items.map((i) => i.label)).toEqual(["yaml"]);
    expect(equals?.items[0]?.edit.text).toBe("yaml ");
  });
});

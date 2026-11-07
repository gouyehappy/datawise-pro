import { describe, expect, it } from "vitest";
import {
  argSuggestionList,
  argWantsPath,
  findPendingOptionArg,
  hasFigCommandSpec,
  matchAttachedOptionArg,
  shouldSuppressSoftHistoryUnderFig,
} from "./optionArgPhase";

const curlRoot = {
  name: "curl",
  options: [
    { name: ["-G", "--get"], description: "Use GET" },
    { name: ["-E", "--cert"], description: "Client cert", args: { name: "certificate[:password]" } },
    { name: ["-K", "--config"], description: "Config file", args: { name: "file", template: "filepaths" } },
    { name: ["-o", "--output"], description: "Output", args: { name: "file", template: "filepaths" } },
  ],
  args: { name: "URL", template: "history" },
};

describe("argWantsPath", () => {
  it("detects filepath templates and file-like names", () => {
    expect(argWantsPath({ name: "file", template: "filepaths" })).toBe(true);
    expect(argWantsPath({ name: "certificate[:password]" })).toBe(true);
    expect(argWantsPath({ name: "URL", template: "history" })).toBe(false);
    expect(argWantsPath({ name: "unit" })).toBe(false);
  });
});

describe("argSuggestionList", () => {
  it("reads string and named suggestion entries", () => {
    expect(argSuggestionList({ suggestions: ["pods", { name: "nodes" }] })).toEqual(["pods", "nodes"]);
    expect(argSuggestionList([{ suggestions: ["755"] }, { name: "file" }])).toEqual(["755"]);
  });
});

describe("findPendingOptionArg", () => {
  it("detects trailing space after an option that takes an arg", () => {
    const pending = findPendingOptionArg(curlRoot, ["curl", "--cert"], true);
    expect(pending?.option.name).toEqual(["-E", "--cert"]);
    expect(pending?.style).toBe("separate");
    expect(argWantsPath(pending?.option.args)).toBe(true);
  });

  it("detects typing the value of an option arg", () => {
    const pending = findPendingOptionArg(curlRoot, ["curl", "--cert", "./fo"], false);
    expect(pending?.option.name).toEqual(["-E", "--cert"]);
    expect(pending?.valuePrefix).toBe("./fo");
  });

  it("detects --opt=value pending phase", () => {
    const pending = findPendingOptionArg(curlRoot, ["curl", "--config=./fo"], false);
    expect(pending?.style).toBe("equals");
    expect(pending?.valuePrefix).toBe("./fo");
    expect(argWantsPath(pending?.option.args)).toBe(true);
  });

  it("detects attached short-opt args", () => {
    const pending = findPendingOptionArg(curlRoot, ["curl", "-ofile"], false);
    expect(pending?.style).toBe("attached");
    expect(pending?.valuePrefix).toBe("file");
    expect(matchAttachedOptionArg(curlRoot, "-Kcert")?.valuePrefix).toBe("cert");
  });

  it("is null after a boolean flag", () => {
    expect(findPendingOptionArg(curlRoot, ["curl", "--get"], true)).toBeNull();
  });

  it("is null while still typing the flag token", () => {
    expect(findPendingOptionArg(curlRoot, ["curl", "--ce"], false)).toBeNull();
  });

  it("exits value mode when the next token looks like a new flag", () => {
    expect(findPendingOptionArg(curlRoot, ["curl", "--cert", "--get"], false)).toBeNull();
  });
});

describe("shouldSuppressSoftHistoryUnderFig", () => {
  const manifest = { curl: curlRoot };
  it("suppresses on trailing space and flag prefixes for known specs", () => {
    expect(shouldSuppressSoftHistoryUnderFig("curl ", manifest)).toBe(true);
    expect(shouldSuppressSoftHistoryUnderFig("curl --", manifest)).toBe(true);
    expect(shouldSuppressSoftHistoryUnderFig("curl --cert ", manifest)).toBe(true);
  });

  it("allows soft history while typing a positional-looking token", () => {
    expect(shouldSuppressSoftHistoryUnderFig("curl https", manifest)).toBe(false);
  });
});

describe("hasFigCommandSpec", () => {
  it("checks manifest membership", () => {
    expect(hasFigCommandSpec("curl", { curl: curlRoot })).toBe(true);
    expect(hasFigCommandSpec("nope", { curl: curlRoot })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyDropEntries,
  parentDirsOf,
  sanitizeRelativePath,
} from "./folderDrop";

describe("sanitizeRelativePath", () => {
  it("strips slashes and rejects traversal", () => {
    expect(sanitizeRelativePath("/a/b.txt")).toBe("a/b.txt");
    expect(sanitizeRelativePath("a\\b\\c.txt")).toBe("a/b/c.txt");
    expect(sanitizeRelativePath("../etc/passwd")).toBeNull();
    expect(sanitizeRelativePath("ok/../../x")).toBeNull();
    expect(sanitizeRelativePath("")).toBeNull();
    expect(sanitizeRelativePath(".")).toBeNull();
  });
});

describe("classifyDropEntries", () => {
  it("treats nested paths as a folder drop", () => {
    expect(classifyDropEntries(["a.txt", "b.txt"])).toBe("files");
    expect(classifyDropEntries(["dir/a.txt"])).toBe("folder");
    expect(classifyDropEntries([])).toBe("empty-folder");
  });
});

describe("parentDirsOf", () => {
  it("lists each ancestor once", () => {
    expect(parentDirsOf("src/lib/a.ts")).toEqual(["src", "src/lib"]);
    expect(parentDirsOf("a.ts")).toEqual([]);
  });
});

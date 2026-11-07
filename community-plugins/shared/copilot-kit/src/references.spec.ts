import { describe, expect, it } from "vitest";
import { extractUrlReferences } from "./references";

describe("extractUrlReferences", () => {
  it("extracts markdown links with titles", () => {
    const refs = extractUrlReferences(
      "See [Docs](https://example.com/docs) and more.",
    );
    expect(refs).toEqual([{ url: "https://example.com/docs", title: "Docs" }]);
  });

  it("extracts bare urls and uses hostname as title", () => {
    const refs = extractUrlReferences("Visit https://foo.bar/path for details.");
    expect(refs).toEqual([{ url: "https://foo.bar/path", title: "foo.bar" }]);
  });

  it("dedupes markdown and bare of the same url", () => {
    const refs = extractUrlReferences(
      "[A](https://example.com/x) also https://example.com/x",
    );
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe("https://example.com/x");
  });

  it("caps at max references", () => {
    const body = Array.from({ length: 12 }, (_, i) => `https://n${i}.example/`).join(" ");
    expect(extractUrlReferences(body, 8)).toHaveLength(8);
  });

  it("strips trailing punctuation from bare urls", () => {
    const refs = extractUrlReferences("link https://example.com/a).");
    expect(refs[0]!.url).toBe("https://example.com/a");
  });
});

import { describe, expect, it } from "vitest";
import {
  normalizeCopilotReplyLanguage,
  replyLanguageInstruction,
  resolveReplyLocale,
} from "./replyLocale";

describe("resolveReplyLocale", () => {
  it("honors explicit preference", () => {
    expect(resolveReplyLocale("en", "zh-CN")).toBe("en");
    expect(resolveReplyLocale("zh-CN", "en-US")).toBe("zh-CN");
  });

  it("maps UI locale when auto", () => {
    expect(resolveReplyLocale("auto", "zh-CN")).toBe("zh-CN");
    expect(resolveReplyLocale("auto", "zh_TW")).toBe("zh-CN");
    expect(resolveReplyLocale("auto", "en-US")).toBe("en");
  });
});

describe("normalizeCopilotReplyLanguage", () => {
  it("accepts known values only", () => {
    expect(normalizeCopilotReplyLanguage("auto")).toBe("auto");
    expect(normalizeCopilotReplyLanguage("fr")).toBeNull();
  });
});

describe("replyLanguageInstruction", () => {
  it("asks for Simplified Chinese for zh locales", () => {
    expect(replyLanguageInstruction("zh-CN")).toMatch(/Simplified Chinese|简体中文/);
  });

  it("asks for English for en locales", () => {
    expect(replyLanguageInstruction("en")).toMatch(/English/);
  });
});

import { describe, expect, it } from "vitest";
import {
  autofillShouldYield,
  matchAutofillRules,
  sanitizeAutofillRuleInput,
  sanitizeAutofillRules,
  type AutofillRule,
} from "./autofillRules";

const base: AutofillRule = {
  id: "1",
  name: "yes",
  pattern: "Continue\\?",
  enabled: true,
  send: "text",
  fixedText: "y",
  appendEnter: true,
};

describe("sanitizeAutofillRuleInput", () => {
  it("rejects empty name/pattern and multiline text", () => {
    expect(sanitizeAutofillRuleInput({ name: "", pattern: "a", fixedText: "x" }).ok).toBe(false);
    expect(sanitizeAutofillRuleInput({ name: "n", pattern: "(", fixedText: "x" }).ok).toBe(false);
    expect(sanitizeAutofillRuleInput({ name: "n", pattern: "a", fixedText: "a\nb" }).ok).toBe(false);
  });

  it("allows bare Enter when text is empty and appendEnter is on", () => {
    const result = sanitizeAutofillRuleInput({ name: "enter", pattern: "Press Enter", fixedText: "", appendEnter: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rule.fixedText).toBe("");
  });
});

describe("matchAutofillRules", () => {
  it("returns the first enabled matching rule with payload", () => {
    const match = matchAutofillRules("Continue? ", [base, { ...base, id: "2", name: "later" }]);
    expect(match?.rule.id).toBe("1");
    expect(match?.payload).toBe("y\r");
  });

  it("skips disabled and invalid patterns", () => {
    expect(matchAutofillRules("Continue?", [{ ...base, enabled: false }])).toBeNull();
    expect(
      matchAutofillRules("Continue?", [{ ...base, pattern: "(unclosed" }]),
    ).toBeNull();
  });
});

describe("sanitizeAutofillRules", () => {
  it("caps the list and drops bad rows", () => {
    expect(sanitizeAutofillRules([{ name: "x" }, base])).toEqual([
      expect.objectContaining({ id: "1", name: "yes" }),
    ]);
  });
});

describe("autofillShouldYield", () => {
  it("defers when the interactive-prompt predicate says so", () => {
    expect(autofillShouldYield("Password:", (line) => /password/i.test(line))).toBe(true);
    expect(autofillShouldYield("Continue?", () => false)).toBe(false);
  });
});

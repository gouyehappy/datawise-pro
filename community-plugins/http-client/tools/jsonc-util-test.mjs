import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));
const sandbox = {
  console,
  document: { addEventListener() {}, createElement() { return {}; } }
};
sandbox.window = sandbox;
sandbox.HC = { i18n: { t: (key) => key }, util: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, "../ui/util.js"), "utf8"), sandbox);
const {
  stripJsonComments,
  parseJsonc,
  tryFormatJson,
  isJsonContentType,
  toggleLineComments,
  looksLikeJson,
  highlightSource
} = sandbox.HC.util;

function assert(name, cond, detail) {
  if (!cond) {
    console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`ok   ${name}`);
  return true;
}

assert(
  "strip line comment",
  stripJsonComments('{\n  // note\n  "a": 1\n}').includes('"a"') &&
    !stripJsonComments('{\n  // note\n  "a": 1\n}').includes("note")
);

assert(
  "strip block comment",
  !stripJsonComments('{ "a": /* x */ 1 }').includes("x") &&
    parseJsonc('{ "a": /* x */ 1 }').a === 1
);

assert(
  "keep slash inside string",
  parseJsonc('{ "url": "https://example.com" }').url === "https://example.com"
);

assert(
  "keep escaped quote then comment",
  parseJsonc('{ "q": "say \\"hi\\" // not comment", "b": 2 }').b === 2
);

assert(
  "format with comments",
  tryFormatJson('{\n//a\n"x":1}') === '{\n  "x": 1\n}'
);

assert(
  "looksLikeJson ignores leading comment",
  looksLikeJson("// prelude\n{ \"a\": 1 }") === true
);

assert("json content-type", isJsonContentType("application/json; charset=utf-8") === true);
assert("json ld", isJsonContentType("application/ld+json") === true);
assert("not json", isJsonContentType("text/plain") === false);

const toggled = toggleLineComments("  foo\n  bar", 0, 3);
assert(
  "toggle comment on",
  toggled && toggled.value.startsWith("  // foo"),
  toggled && toggled.value
);
const untoggled = toggleLineComments(toggled.value, 0, toggled.value.indexOf("\n"));
assert(
  "toggle comment off",
  untoggled && untoggled.value.startsWith("  foo"),
  untoggled && untoggled.value
);

const hi = highlightSource('{\n  // note\n  "a": 1\n}', "json");
assert("highlight comment class", hi.includes("hc-code-comment") && hi.includes("// note"));
assert("highlight json key", hi.includes("hc-json-key") && hi.includes('"a"'));
const hiJs = highlightSource("// x\nvar a = 1;", "js");
assert("highlight js keyword", hiJs.includes("hc-code-keyword") && hiJs.includes("var"));

if (!process.exitCode) console.log("\nAll jsonc util tests passed.");

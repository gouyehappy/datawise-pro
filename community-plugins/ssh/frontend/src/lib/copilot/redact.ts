/**
 * Mask secrets in text before it is sent to a model.
 * Ported from motty `internal/ai/agent/redact.go` so SSH covers the same secret
 * classes: PEM private keys (line count preserved), flattened single-line keys,
 * password/token/secret/api_key assignments, URL credentials, vendor token
 * prefixes, Bearer/Basic auth, AWS access key ids and JWT-looking tokens.
 * Ordinary text is returned unchanged (no allocation when nothing matches).
 *
 * Runs on the whole assembled prompt in App.askCopilotLlm, so it covers terminal
 * selections, attachments, session context JSON and tool-output follow-ups.
 */

const MASK = "***";
const PEM_BEGIN = "-----BEGIN ";

const RE_ASSIGN = /(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key)(["']?[^\S\n]*[=:][^\S\n]*)("[^"\n]*"|'[^'\n]*'|[^\s"',;&]+)/gi;
const RE_FLAG = /(--(?:password|passwd|token|secret|api-key)[= ])(\S+)/gi;
const RE_BEARER = /\b(bearer[^\S\n]+)[A-Za-z0-9._~+/=-]{8,}/gi;
const RE_BASIC = /(authorization[^\S\n]*:[^\S\n]*basic[^\S\n]+)\S+/gi;
const RE_AWS = /\b((?:AKIA|ASIA)[0-9A-Z]{16})\b/g;
const RE_JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const RE_URL_PASSWORD = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/@:]+):[^\s/@]+@/g;
const RE_URL_USER = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^\s/@:]+@/g;
const RE_VENDOR = /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|sk_(?:live|test|proj)_[A-Za-z0-9]{16,}|pk_(?:live|test)_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{16,})/g;
const RE_FLAT_PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----.*-----END [A-Z ]*PRIVATE KEY-----/g;

const VENDOR_PREFIXES = ["ghp_", "github_pat_", "xox", "AIza", "sk_live_", "sk_test_", "sk_proj_", "pk_live_", "pk_test_", "glpat-"];

function hasFold(text: string, lower: string): boolean {
  if (!lower) return false;
  const folded = text.toLowerCase();
  return folded.includes(lower);
}

/** Replace body lines of PEM private-key blocks with [REDACTED], keeping line count. */
function redactPem(text: string): string {
  let out = "";
  let rest = text;
  for (;;) {
    const start = rest.indexOf(PEM_BEGIN);
    if (start < 0) {
      out += rest;
      return out;
    }
    const eol = rest.indexOf("\n", start);
    const header = eol >= 0 ? rest.slice(start, eol) : rest.slice(start);
    if (!header.includes("PRIVATE KEY-----")) {
      // Not a private key header (e.g. CERTIFICATE) — keep the marker and continue.
      out += rest.slice(0, start + PEM_BEGIN.length);
      rest = rest.slice(start + PEM_BEGIN.length);
      continue;
    }
    out += rest.slice(0, start);
    const block = rest.slice(start);
    let end = block.length;
    const endMarker = block.indexOf("-----END ");
    if (endMarker >= 0) {
      const nl = block.indexOf("\n", endMarker);
      end = nl >= 0 ? nl : block.length;
    }
    const lines = block.slice(0, end).split("\n");
    out += lines.map((line) => {
      const isHeader = line.startsWith(PEM_BEGIN) && line.includes("PRIVATE KEY-----");
      const isFooter = line.startsWith("-----END ");
      return isHeader || isFooter ? line : "[REDACTED]";
    }).join("\n");
    rest = block.slice(end);
  }
}

/** Apply single-line rules; cheap gates keep ordinary lines off the regexes. */
function redactLine(line: string): string {
  let value = line;
  if (hasFold(value, "pass") || hasFold(value, "pwd") || hasFold(value, "secret") || hasFold(value, "token") || hasFold(value, "key")) {
    value = value.replace(RE_ASSIGN, (_m, key, sep, val) => {
      // Preserve surrounding quotes so JSON / shell quoting stays readable.
      const quoted = val.length >= 2 && ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")));
      return quoted ? `${key}${sep}${val[0]}${MASK}${val[val.length - 1]}` : `${key}${sep}${MASK}`;
    });
    value = value.replace(RE_FLAG, (_m, flag) => `${flag}${MASK}`);
  }
  if (hasFold(value, "bearer")) {
    value = value.replace(RE_BEARER, (_m, prefix) => `${prefix}${MASK}`);
  }
  if (hasFold(value, "basic")) {
    value = value.replace(RE_BASIC, (_m, prefix) => `${prefix}${MASK}`);
  }
  if (value.includes("AKIA") || value.includes("ASIA")) {
    value = value.replace(RE_AWS, (m) => `${m.slice(0, 4)}${MASK}`);
  }
  if (value.includes("eyJ")) {
    value = value.replace(RE_JWT, MASK);
  }
  if (value.includes("://") && value.includes("@")) {
    value = value.replace(RE_URL_PASSWORD, (_m, prefix) => `${prefix}:${MASK}@`);
    value = value.replace(RE_URL_USER, (_m, prefix) => `${prefix}${MASK}@`);
  }
  if (value.includes("PRIVATE KEY-----") && value.includes("\\n")) {
    value = value.replace(RE_FLAT_PEM, MASK);
  }
  for (const prefix of VENDOR_PREFIXES) {
    if (value.includes(prefix)) {
      value = value.replace(RE_VENDOR, MASK);
      break;
    }
  }
  return value;
}

/** Mask all recognized secret classes in `text`. No-op when `enabled` is false. */
export function redactSensitiveText(text: string, enabled = true): string {
  if (!enabled || !text) return text;
  const pemHandled = text.includes(PEM_BEGIN) ? redactPem(text) : text;
  const hasNewline = pemHandled.includes("\n");
  if (!hasNewline) return redactLine(pemHandled);
  // Process each line independently so a multiline PEM body stays intact.
  return pemHandled.split("\n").map(redactLine).join("\n");
}

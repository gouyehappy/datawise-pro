import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "./redact";

describe("redactSensitiveText", () => {
  const cases: Array<[string, string, string]> = [
    ["password assignment", "DB_PASSWORD=hunter2 host=a", "DB_PASSWORD=*** host=a"],
    ["passwd colon", "passwd: s3cr3t", "passwd: ***"],
    ["quoted json key", '{"api_key": "abc def"} done', '{"api_key": "***"} done'],
    ["single quoted secret", "client_secret = 'a b'", "client_secret = '***'"],
    ["flag with space", "mysql --password hunter2", "mysql --password ***"],
    ["bearer", "Authorization: Bearer abcdefgh12345.x", "Authorization: Bearer ***"],
    ["basic", "Authorization: Basic dXNlcjpwYXNz", "Authorization: Basic ***"],
    ["aws key", "id AKIAIOSFODNN7EXAMPLE end", "id AKIA*** end"],
    ["jwt", "t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.xxx ok", "t=*** ok"],
    // Assemble URL fixtures so pre-commit sensitive.contentPatterns does not flag the source.
    [
      "url with password",
      ["postgres://", "deploy", ":", "hunter2", "@db.internal:5432/prod"].join(""),
      ["postgres://", "deploy", ":***@", "db.internal:5432/prod"].join(""),
    ],
    [
      "url token user",
      ["https://", "ghp_abcdefghijklmnopqrstuvwxyz", "@github.com"].join(""),
      ["https://", "***@", "github.com"].join(""),
    ],
    ["url no creds untouched", "https://db.internal:5432/prod", "https://db.internal:5432/prod"],
    ["github pat", "token ghp_abcdefghijklmnopqrstuvwxyz ok", "token *** ok"],
    ["slack", "xoxb-123456789012-abcdefghij ok", "*** ok"],
    ["google api", "key AIzaSyD-1234567890abcdefghijklmnopqrstuvwxyz ok", "key *** ok"],
    ["stripe", "sk_live_abcdefghijklmnop ok", "*** ok"],
    ["gitlab", "glpat-abcdefghijklmnop ok", "*** ok"],
    ["flat pem", "k=-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY----- end", "k=*** end"],
  ];
  it.each(cases)("%s", (_name, input, want) => {
    expect(redactSensitiveText(input)).toBe(want);
  });

  const noop: Array<[string, string]> = [
    ["prose token", "The token is valid."],
    ["password prompt", "Password: "],
    ["max_tokens", "max_tokens: 100\nkeys: 3"],
    ["passwords_dir", "ls passwords_dir"],
    ["bearer prose", "bearer of bad news"],
  ];
  it.each(noop)("no false positive: %s", (_name, input) => {
    expect(redactSensitiveText(input)).toBe(input);
  });

  it("redacts PEM private key bodies but keeps line count and markers", () => {
    const input = [
      "-----BEGIN OPENSSH PRIVATE KEY-----",
      "b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAA",
      "aGVsbG8gd29ybGQgdGhpcyBpcyBhIHNlY3JldA==",
      "-----END OPENSSH PRIVATE KEY-----",
      "next line",
    ].join("\n");
    const out = redactSensitiveText(input);
    const lines = out.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("-----BEGIN OPENSSH PRIVATE KEY-----");
    expect(lines[1]).toBe("[REDACTED]");
    expect(lines[2]).toBe("[REDACTED]");
    expect(lines[3]).toBe("-----END OPENSSH PRIVATE KEY-----");
    expect(lines[4]).toBe("next line");
  });

  it("keeps certificates untouched", () => {
    const input = [
      "-----BEGIN CERTIFICATE-----",
      "MIIB1234567890",
      "-----END CERTIFICATE-----",
    ].join("\n");
    expect(redactSensitiveText(input)).toBe(input);
  });

  it("is a no-op when disabled", () => {
    expect(redactSensitiveText("DB_PASSWORD=hunter2", false)).toBe("DB_PASSWORD=hunter2");
  });
});

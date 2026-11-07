import { describe, expect, it } from "vitest";
import {
  cardCommand,
  normalizeCardArgs,
  parseActionCardsFromLlm,
  stripActionCardJson,
} from "./cards";
import type { CardPolicy } from "./adapter";

const policy: CardPolicy = {
  isToolAllowed: (tool) => tool.startsWith("ssh_") || tool.startsWith("sftp_"),
  toolRisk: () => "read",
};

describe("normalizeCardArgs", () => {
  it("lifts top-level command into args", () => {
    const args = normalizeCardArgs("ssh_exec", {
      tool: "ssh_exec",
      command: "uptime",
      runInTerminal: true,
    });
    expect(args.command).toBe("uptime");
    expect(args.runInTerminal).toBe(true);
  });

  it("maps cmd alias to command", () => {
    const args = normalizeCardArgs("ssh_exec", {
      tool: "ssh_exec",
      args: { cmd: "df -h" },
    });
    expect(args.command).toBe("df -h");
  });
});

describe("parseActionCardsFromLlm", () => {
  it("accepts top-level command cards", () => {
    const text = `
\`\`\`json
{ "cards": [ { "id": "1", "title": "CPU", "tool": "ssh_exec", "command": "ps aux | head", "runInTerminal": true, "risk": "read" } ] }
\`\`\`
`;
    const cards = parseActionCardsFromLlm(text, policy);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.args.command).toBe("ps aux | head");
    expect(cards[0]?.args.runInTerminal).toBe(true);
  });

  it("drops ssh_exec cards with no command", () => {
    const text = `
\`\`\`json
{ "cards": [ { "id": "1", "title": "CPU", "tool": "ssh_exec", "args": { "runInTerminal": true }, "risk": "read" } ] }
\`\`\`
`;
    expect(parseActionCardsFromLlm(text, policy)).toEqual([]);
  });
});

describe("cardCommand", () => {
  it("reads command aliases", () => {
    expect(cardCommand({ cmd: "id" })).toBe("id");
    expect(cardCommand({})).toBe("");
  });
});

describe("stripActionCardJson", () => {
  it("removes card JSON fences but keeps bash examples", () => {
    const text = `
Run this:

\`\`\`bash
df -h
\`\`\`

Then apply:

\`\`\`json
{ "cards": [ { "id": "1", "title": "Disk", "tool": "ssh_exec", "args": { "command": "df -h" } } ] }
\`\`\`
`;
    const cleaned = stripActionCardJson(text);
    expect(cleaned).toContain("```bash");
    expect(cleaned).toContain("df -h");
    expect(cleaned).not.toContain('"cards"');
  });

  it("hides incomplete trailing card fence", () => {
    const cleaned = stripActionCardJson('Answer\n```json\n{ "cards": [');
    expect(cleaned).toBe("Answer");
  });
});

/**
 * Read / export helpers for xterm buffer text (Motty save-output / web-search).
 */

export type BufferLineSource = {
  length: number;
  getLine(y: number): { translateToString(trimRight?: boolean): string } | undefined;
};

/** Join active-buffer lines into plain text (trim trailing cells per line). */
export function readTerminalBufferText(buffer: BufferLineSource): string {
  const lines: string[] = [];
  const len = Math.max(0, Math.floor(buffer.length));
  for (let y = 0; y < len; y += 1) {
    const line = buffer.getLine(y);
    lines.push(line ? line.translateToString(true) : "");
  }
  // Drop a single trailing empty line xterm often leaves after the cursor.
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** Last `maxChars` of buffer text (explain-recent / Copilot). */
export function readTerminalRecentText(buffer: BufferLineSource, maxChars = 6000): string {
  const full = readTerminalBufferText(buffer);
  if (full.length <= maxChars) return full;
  return full.slice(full.length - maxChars);
}

/** Default browser search URL for a selection (Motty MenuSearchSelection). */
export function webSearchUrlForSelection(selection: string): string | null {
  const q = selection.trim();
  if (!q) return null;
  return `https://www.google.com/search?q=${encodeURIComponent(q.slice(0, 2000))}`;
}

/** Safe download basename for exported terminal output. */
export function terminalOutputFileName(stamp = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = stamp.getFullYear();
  const m = pad(stamp.getMonth() + 1);
  const d = pad(stamp.getDate());
  const hh = pad(stamp.getHours());
  const mm = pad(stamp.getMinutes());
  const ss = pad(stamp.getSeconds());
  return `terminal-${y}${m}${d}-${hh}${mm}${ss}.txt`;
}

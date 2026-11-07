/** Heuristic for LLM-proposed shell commands that should still confirm. */
export function looksDestructiveCommand(command: string): boolean {
  const c = command.toLowerCase();
  if (!c.trim()) return false;
  return (
    /\bsudo\b/.test(c) ||
    /\b(rm|mkfs|dd|reboot|shutdown|poweroff|halt)\b/.test(c) ||
    /\b(chmod|chown|chgrp|kill|pkill|killall)\b/.test(c) ||
    /\bsystemctl\s+(stop|restart|disable|mask|daemon-reload)\b/.test(c) ||
    /\b(iptables|nft|ufw)\b/.test(c) ||
    /(^|[;&|])\s*(tee|dd)\b/.test(c) ||
    />\s*\/(?!dev\/null)/.test(c)
  );
}

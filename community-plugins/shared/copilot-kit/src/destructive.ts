/** Heuristic for LLM-proposed shell commands that should still confirm. */
export function looksDestructiveCommand(command: string): boolean {
  const c = command.toLowerCase();
  if (!c.trim()) return false;
  // Expansion / substitution often hides verbs from simple token checks.
  if (/\$\(|`|\$\{/.test(command)) return true;
  if (/\beval\b|\bsource\b|\b\.[\t ]+\//.test(c)) return true;
  if (/\bbase64\b/.test(c) && /\b(sh|bash|zsh|dash|ksh)\b/.test(c)) return true;
  if (/\b(sh|bash|zsh|dash|ksh)\b[\s\S]*\s-c\b/.test(c)) return true;
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

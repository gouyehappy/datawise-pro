/** JumpServer / bastion menus — suppress suggest and skip remote HISTFILE import. */
export function isBastionMenuContext(line: string): boolean {
  const text = line || "";
  if (/\bOpt>\s/.test(text) && !/@[\w.-]+:/.test(text)) return true;
  if (/JumpServer|Jumpserver|堡垒/i.test(text) && !/@[\w.-]+:/.test(text)) return true;
  return false;
}

/** In-plugin protocol session helpers (protocol parity — not host connection-providers). */

export type ProtocolKind = "local" | "telnet" | "serial" | "vnc" | "rdp";

export interface ProtocolSessionRef {
  kind: ProtocolKind;
  sessionId: string;
  label: string;
}

export async function startLocalTerminal(opts: {
  workbenchId: string;
  cols: number;
  rows: number;
  shell?: string;
}): Promise<{ sessionId: string }> {
  return window.datawisePlugin.invoke("local/terminal/start", opts);
}

export async function startTelnet(opts: Record<string, unknown>): Promise<{ sessionId: string }> {
  return window.datawisePlugin.invoke("telnet/start", opts);
}

export async function startSerial(opts: Record<string, unknown>): Promise<{ sessionId: string }> {
  return window.datawisePlugin.invoke("serial/start", opts);
}

export async function startVnc(opts: Record<string, unknown>): Promise<{ sessionId: string }> {
  return window.datawisePlugin.invoke("vnc/start", opts);
}

export async function startRdp(opts: Record<string, unknown>): Promise<{ sessionId: string }> {
  return window.datawisePlugin.invoke("rdp/start", opts);
}

export async function validateTask(params: Record<string, unknown>): Promise<unknown> {
  return window.datawisePlugin.invoke("task/validate", params);
}

export async function executeTask(params: Record<string, unknown>): Promise<unknown> {
  return window.datawisePlugin.invoke("task/execute", params);
}

export async function taskStatus(params: Record<string, unknown>): Promise<unknown> {
  return window.datawisePlugin.invoke("task/status", params);
}

import type { ForwardFormDraft, ForwardKind } from "./portForward";

export type PersistedForward = {
  kind: ForwardKind;
  listenHost: string;
  listenPort: string;
  targetHost: string;
  targetPort: string;
};

export function forwardsStorageKey(connectionId: string): string {
  return `ssh-forwards:${connectionId}`;
}

export function sanitizePersistedForwards(raw: unknown): PersistedForward[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedForward[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const kind: ForwardKind = r.kind === "remote" || r.kind === "dynamic" ? r.kind : "local";
    const listenPort = String(r.listenPort ?? "").trim();
    if (!listenPort) continue;
    const item: PersistedForward = {
      kind,
      listenHost: String(r.listenHost ?? "").trim() || "127.0.0.1",
      listenPort,
      targetHost: String(r.targetHost ?? "").trim(),
      targetPort: String(r.targetPort ?? "").trim(),
    };
    if (kind !== "dynamic" && (!item.targetHost || !item.targetPort)) continue;
    const key = `${item.kind}|${item.listenHost}|${item.listenPort}|${item.targetHost}|${item.targetPort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= 32) break;
  }
  return out;
}

export function draftToPersisted(draft: ForwardFormDraft): PersistedForward {
  return {
    kind: draft.kind,
    listenHost: draft.listenHost.trim() || "127.0.0.1",
    listenPort: draft.listenPort.trim(),
    targetHost: draft.targetHost.trim(),
    targetPort: draft.targetPort.trim(),
  };
}

export function upsertPersistedForward(list: PersistedForward[], item: PersistedForward): PersistedForward[] {
  const keyOf = (row: PersistedForward) =>
    `${row.kind}|${row.listenHost}|${row.listenPort}|${row.targetHost}|${row.targetPort}`;
  const next = list.filter((row) => keyOf(row) !== keyOf(item));
  next.push(item);
  return next.slice(-32);
}

export function removePersistedForward(
  list: PersistedForward[],
  match: { kind: string; listenHost: string; listenPort: number; targetHost: string; targetPort: number },
): PersistedForward[] {
  return list.filter(
    (row) =>
      !(
        row.kind === match.kind
        && (row.listenHost || "127.0.0.1") === (match.listenHost || "127.0.0.1")
        && Number(row.listenPort) === match.listenPort
        && (row.kind === "dynamic" || (row.targetHost === match.targetHost && Number(row.targetPort) === match.targetPort))
      ),
  );
}

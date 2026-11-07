export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  status: string;
  running: boolean;
};

const REF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

export function sanitizeContainerRef(value: string): string | null {
  const trimmed = value.trim();
  if (!REF.test(trimmed)) return null;
  return trimmed;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseDockerPsLine(raw: unknown): DockerContainer | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = sanitizeContainerRef(asString(row.ID || row.Id));
  if (!id) return null;
  const nameRaw = asString(row.Names || row.Name) || id;
  const name = nameRaw.replace(/^\//, "").split(",")[0]?.trim() || id;
  const image = asString(row.Image);
  const status = asString(row.Status);
  const state = asString(row.State).toLowerCase();
  const running = state === "running" || /^up\b/i.test(status);
  return { id, name, image, status, running };
}

export function parseDockerPsOutput(output: string): DockerContainer[] {
  const rows: DockerContainer[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = parseDockerPsLine(JSON.parse(trimmed));
      if (parsed) rows.push(parsed);
    } catch {
      // skip non-json noise from sudo banners
    }
  }
  return rows;
}

export function dockerActionLabelKey(action: "start" | "stop" | "restart"): string {
  return `docker.${action}`;
}

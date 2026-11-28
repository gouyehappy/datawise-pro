/**
 * X-CATALOG: Motty-style “check for updates” for the curated Fig extras pack.
 * Bundled Wave 1+2 stays immutable; overlays merge on top and persist in uiStorage.
 * Network fetch goes through sidecar `completion/catalog/fetch` (no CORS).
 */

import { uiStorage } from "../../uiStorage";
import type { FigSpecManifest } from "./source";
import { WAVE1_FIG_MANIFEST } from "./wave1Manifest";

/** Version of the in-plugin Wave 1+2 corpus (not the overlay). */
export const BUNDLED_FIG_CATALOG_VERSION = "2026.11.01-bundled";

/**
 * Default extras pack URL (repo catalog). Sidecar may try a ghproxy mirror
 * when the primary host fails (Motty-like).
 */
export const DEFAULT_FIG_CATALOG_URL =
  "https://raw.githubusercontent.com/gouyehappy/datawise-pro/main/community-plugins/ssh/catalog/fig-extras.json";

export const FIG_CATALOG_OVERLAY_KEY = "ssh-fig-catalog-overlay";
export const FIG_CATALOG_MAX_SPECS = 80;
export const FIG_CATALOG_MAX_JSON_CHARS = 400_000;

export type FigCatalogOverlay = {
  version: string;
  updatedAt: string;
  notes?: string;
  specs: FigSpecManifest;
  sourceUrl?: string;
};

export type FigCatalogRemotePack = {
  version: string;
  notes?: string;
  specs: FigSpecManifest;
};

export type FigCatalogCheckResult =
  | { ok: true; outcome: "installed"; overlay: FigCatalogOverlay; commandCount: number }
  | { ok: true; outcome: "up-to-date"; version: string; commandCount: number }
  | { ok: false; error: string };

export function bundledFigCommandCount(manifest: FigSpecManifest = WAVE1_FIG_MANIFEST): number {
  return Object.keys(manifest).length;
}

/** Compare dotted / dated versions; non-numeric segments compare as strings. */
export function compareCatalogVersions(a: string, b: string): number {
  const left = a.trim().replace(/-bundled$/i, "").split(/[.+_-]/).filter(Boolean);
  const right = b.trim().replace(/-bundled$/i, "").split(/[.+_-]/).filter(Boolean);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i += 1) {
    const l = left[i] ?? "0";
    const r = right[i] ?? "0";
    const ln = Number(l);
    const rn = Number(r);
    if (Number.isFinite(ln) && Number.isFinite(rn)) {
      if (ln !== rn) return ln < rn ? -1 : 1;
      continue;
    }
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

export function sanitizeFigCatalogPack(raw: unknown): FigCatalogRemotePack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const version = typeof o.version === "string" ? o.version.trim().slice(0, 64) : "";
  if (!version) return null;
  const notes = typeof o.notes === "string" ? o.notes.trim().slice(0, 400) : undefined;
  const specsRaw = o.specs;
  if (!specsRaw || typeof specsRaw !== "object" || Array.isArray(specsRaw)) return null;
  const specs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(specsRaw as Record<string, unknown>)) {
    const name = key.trim().slice(0, 64);
    if (!name || !/^[a-zA-Z0-9._+-]+$/.test(name)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    specs[name] = value;
    if (Object.keys(specs).length >= FIG_CATALOG_MAX_SPECS) break;
  }
  if (!Object.keys(specs).length) return null;
  return { version, notes, specs };
}

export function sanitizeFigCatalogOverlay(raw: unknown): FigCatalogOverlay | null {
  const pack = sanitizeFigCatalogPack(raw);
  if (!pack) return null;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const updatedAt = typeof o.updatedAt === "string" && o.updatedAt.trim()
    ? o.updatedAt.trim().slice(0, 40)
    : new Date().toISOString();
  const sourceUrl = typeof o.sourceUrl === "string" ? o.sourceUrl.trim().slice(0, 512) : undefined;
  return {
    version: pack.version,
    notes: pack.notes,
    specs: pack.specs,
    updatedAt,
    sourceUrl,
  };
}

export function loadFigCatalogOverlay(storage: Pick<Storage, "getItem"> = uiStorage): FigCatalogOverlay | null {
  try {
    const raw = storage.getItem(FIG_CATALOG_OVERLAY_KEY);
    if (!raw || raw.length > FIG_CATALOG_MAX_JSON_CHARS) return null;
    return sanitizeFigCatalogOverlay(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistFigCatalogOverlay(
  overlay: FigCatalogOverlay | null,
  storage: Pick<Storage, "setItem" | "removeItem"> = uiStorage,
): void {
  try {
    if (!overlay) {
      storage.removeItem(FIG_CATALOG_OVERLAY_KEY);
      return;
    }
    const clean = sanitizeFigCatalogOverlay(overlay);
    if (!clean) {
      storage.removeItem(FIG_CATALOG_OVERLAY_KEY);
      return;
    }
    const text = JSON.stringify(clean);
    if (text.length > FIG_CATALOG_MAX_JSON_CHARS) return;
    storage.setItem(FIG_CATALOG_OVERLAY_KEY, text);
  } catch {
    // Quota: keep memory-only.
  }
}

/** Overlay keys win over bundled Wave 1+2. */
export function mergeFigManifest(
  base: FigSpecManifest,
  overlay: FigCatalogOverlay | null | undefined,
): FigSpecManifest {
  if (!overlay || !Object.keys(overlay.specs).length) return base;
  return { ...base, ...overlay.specs };
}

export function effectiveFigCatalogVersion(overlay: FigCatalogOverlay | null | undefined): string {
  return overlay?.version?.trim() || BUNDLED_FIG_CATALOG_VERSION;
}

export type FigCatalogStatusView = {
  version: string;
  commandCount: number;
  overlay: boolean;
  updatedAt?: string;
};

export function figCatalogStatusView(
  base: FigSpecManifest,
  overlay: FigCatalogOverlay | null | undefined,
): FigCatalogStatusView {
  const merged = mergeFigManifest(base, overlay);
  return {
    version: effectiveFigCatalogVersion(overlay),
    commandCount: bundledFigCommandCount(merged),
    overlay: !!overlay,
    updatedAt: overlay?.updatedAt,
  };
}

/**
 * Decide whether a remote pack should replace the installed overlay.
 * Remote must be strictly newer than the effective (overlay or bundled) version.
 */
export function shouldInstallCatalogPack(
  remote: FigCatalogRemotePack,
  overlay: FigCatalogOverlay | null | undefined,
): boolean {
  return compareCatalogVersions(remote.version, effectiveFigCatalogVersion(overlay)) > 0;
}

export function installCatalogPack(
  remote: FigCatalogRemotePack,
  sourceUrl: string,
  now: Date = new Date(),
): FigCatalogOverlay {
  return {
    version: remote.version,
    notes: remote.notes,
    specs: remote.specs,
    updatedAt: now.toISOString(),
    sourceUrl: sourceUrl.slice(0, 512),
  };
}

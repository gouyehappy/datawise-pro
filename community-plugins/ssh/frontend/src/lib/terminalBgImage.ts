/**
 * X-BGIMG: Motty-style terminal backdrop image.
 * Client-side resize (max edge) → data URL persisted in uiStorage (capped).
 * Painted behind the terminal pane; xterm ground stays translucent by strength.
 */

import { uiStorage } from "./uiStorage";

export type TerminalBgStrength = "subtle" | "medium" | "strong";

export type TerminalBgImagePrefs = {
  /** data:image/... URL after resize; null = none. */
  dataUrl: string | null;
  name: string;
  strength: TerminalBgStrength;
};

export const TERMINAL_BG_IMAGE_KEY = "ssh-terminal-bg-image";
export const TERMINAL_BG_MAX_EDGE = 1920;
/** Persist cap (~1.2 MiB of base64) so uiStorage cannot balloon. */
export const TERMINAL_BG_MAX_DATA_URL_CHARS = 1_200_000;
export const TERMINAL_BG_MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export const DEFAULT_TERMINAL_BG_IMAGE: TerminalBgImagePrefs = {
  dataUrl: null,
  name: "",
  strength: "medium",
};

export function sanitizeBgStrength(raw: unknown): TerminalBgStrength {
  return raw === "subtle" || raw === "strong" || raw === "medium" ? raw : "medium";
}

export function sanitizeTerminalBgImagePrefs(raw: unknown): TerminalBgImagePrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const dataUrl = typeof o.dataUrl === "string" && o.dataUrl.startsWith("data:image/")
    ? o.dataUrl.slice(0, TERMINAL_BG_MAX_DATA_URL_CHARS)
    : null;
  const usable = dataUrl && dataUrl.length > 32 && dataUrl.length <= TERMINAL_BG_MAX_DATA_URL_CHARS
    ? dataUrl
    : null;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  return {
    dataUrl: usable,
    name: usable ? name : "",
    strength: sanitizeBgStrength(o.strength),
  };
}

export function loadTerminalBgImagePrefs(storage: Pick<Storage, "getItem"> = uiStorage): TerminalBgImagePrefs {
  try {
    const raw = storage.getItem(TERMINAL_BG_IMAGE_KEY);
    if (!raw) return { ...DEFAULT_TERMINAL_BG_IMAGE };
    return sanitizeTerminalBgImagePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TERMINAL_BG_IMAGE };
  }
}

export function persistTerminalBgImagePrefs(
  prefs: TerminalBgImagePrefs,
  storage: Pick<Storage, "setItem" | "removeItem"> = uiStorage,
): void {
  try {
    const clean = sanitizeTerminalBgImagePrefs(prefs);
    if (!clean.dataUrl) {
      storage.removeItem(TERMINAL_BG_IMAGE_KEY);
      return;
    }
    storage.setItem(TERMINAL_BG_IMAGE_KEY, JSON.stringify(clean));
  } catch {
    // Quota: keep in-memory only.
  }
}

/**
 * Motty surface opacity over the picture → we expose image opacity + terminal
 * background alpha so the grid stays readable.
 */
export function bgStrengthVisuals(strength: TerminalBgStrength): {
  imageOpacity: number;
  terminalBgAlpha: number;
} {
  switch (strength) {
    case "subtle":
      return { imageOpacity: 0.22, terminalBgAlpha: 0.92 };
    case "strong":
      return { imageOpacity: 0.55, terminalBgAlpha: 0.62 };
    default:
      return { imageOpacity: 0.38, terminalBgAlpha: 0.8 };
  }
}

/** Decode + cover-fit resize to max edge; returns JPEG data URL. */
export async function encodeTerminalBgImage(
  file: Blob,
  options?: { maxEdge?: number; quality?: number },
): Promise<{ dataUrl: string; name: string }> {
  if (file.size <= 0) throw new Error("empty");
  if (file.size > TERMINAL_BG_MAX_SOURCE_BYTES) throw new Error("too-large");
  const type = (file.type || "").toLowerCase();
  if (type && !type.startsWith("image/")) throw new Error("not-image");

  const maxEdge = options?.maxEdge ?? TERMINAL_BG_MAX_EDGE;
  const quality = options?.quality ?? 0.85;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length > TERMINAL_BG_MAX_DATA_URL_CHARS) throw new Error("encoded-too-large");
    const name = file instanceof File && file.name.trim() ? file.name.trim().slice(0, 120) : "background.jpg";
    return { dataUrl, name };
  } finally {
    bitmap.close();
  }
}

/** Apply CSS vars on a terminal pane host. */
export function applyTerminalBgCss(
  el: HTMLElement | null | undefined,
  prefs: TerminalBgImagePrefs,
): void {
  if (!el) return;
  const visuals = bgStrengthVisuals(prefs.strength);
  if (prefs.dataUrl) {
    el.style.setProperty("--ssh-bg-image", `url("${prefs.dataUrl}")`);
    el.style.setProperty("--ssh-bg-image-opacity", String(visuals.imageOpacity));
    el.style.setProperty("--ssh-bg-terminal-alpha", String(visuals.terminalBgAlpha));
    el.dataset.bgImage = "1";
  } else {
    el.style.removeProperty("--ssh-bg-image");
    el.style.removeProperty("--ssh-bg-image-opacity");
    el.style.removeProperty("--ssh-bg-terminal-alpha");
    delete el.dataset.bgImage;
  }
}

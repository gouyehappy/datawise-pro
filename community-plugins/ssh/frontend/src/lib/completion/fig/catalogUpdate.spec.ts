import { describe, expect, it } from "vitest";
import {
  BUNDLED_FIG_CATALOG_VERSION,
  compareCatalogVersions,
  figCatalogStatusView,
  mergeFigManifest,
  sanitizeFigCatalogPack,
  shouldInstallCatalogPack,
} from "./catalogUpdate";
import { WAVE1_FIG_MANIFEST } from "./wave1Manifest";

describe("fig catalogUpdate", () => {
  it("compares catalog versions", () => {
    expect(compareCatalogVersions("2026.11.25", "2026.11.01")).toBe(1);
    expect(compareCatalogVersions("2026.11.01-bundled", "2026.11.01")).toBe(0);
    expect(compareCatalogVersions("0.1.0", "0.2.0")).toBe(-1);
  });

  it("sanitizes remote packs and merges overlays", () => {
    const pack = sanitizeFigCatalogPack({
      version: "2026.11.25",
      specs: {
        htop: { name: "htop" },
        "bad name": { name: "x" },
        empty: null,
      },
    });
    expect(pack?.version).toBe("2026.11.25");
    expect(pack?.specs.htop).toBeTruthy();
    expect(pack?.specs["bad name"]).toBeUndefined();

    const merged = mergeFigManifest(WAVE1_FIG_MANIFEST, {
      version: "2026.11.25",
      updatedAt: "t",
      specs: { htop: { name: "htop" } },
    });
    expect(merged.htop).toBeTruthy();
    expect(merged.git).toBeTruthy();
  });

  it("installs only when remote is newer", () => {
    expect(shouldInstallCatalogPack({ version: "2026.11.25", specs: { a: {} } }, null)).toBe(true);
    expect(
      shouldInstallCatalogPack(
        { version: "2026.11.01", specs: { a: {} } },
        { version: "2026.11.25", updatedAt: "t", specs: { a: {} } },
      ),
    ).toBe(false);
    const status = figCatalogStatusView(WAVE1_FIG_MANIFEST, null);
    expect(status.version).toBe(BUNDLED_FIG_CATALOG_VERSION);
    expect(status.commandCount).toBeGreaterThan(10);
    expect(status.overlay).toBe(false);
  });
});

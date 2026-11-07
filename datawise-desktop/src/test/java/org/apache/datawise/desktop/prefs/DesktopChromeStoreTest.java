package org.apache.datawise.desktop.prefs;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopChromeStoreTest {

    @AfterEach
    void tearDown() {
        DesktopChromeStore.resetForTests();
    }

    @Test
    void writeThemePatchUpdatesCachedSnapshot() {
        JsonObject patch = new JsonObject();
        patch.addProperty("appearance", "dark");
        patch.addProperty("background", "cool");
        patch.addProperty("primary", "blue");
        patch.addProperty("uiSkin", "ide");
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writeThemePatch(patch);
        assertEquals("dark", snap.resolvedMode());
        assertEquals("ide", snap.uiSkin());
        assertEquals("cool", snap.background());
        assertTrue(snap.chromeBg().startsWith("#"));
        assertEquals("dark", DesktopChromeStore.snapshot().resolvedMode());
    }

    @Test
    void writePatchUpdatesLocaleZoomAndEditorFonts() {
        JsonObject patch = new JsonObject();
        patch.addProperty("locale", "en-US");
        patch.addProperty("zoomLevel", 1.5);
        patch.addProperty("editorFontSize", 16);
        patch.addProperty("editorFontFamily", "Consolas");
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writePatch(patch);
        assertEquals("en-US", snap.locale());
        assertEquals(1.5, snap.zoomLevel(), 0.001);
        assertEquals(16, snap.editorFontSize());
        assertEquals("Consolas", snap.editorFontFamily());

        DesktopChromeStore.Snapshot cached = DesktopChromeStore.snapshot();
        assertEquals("en-US", cached.locale());
        assertEquals(1.5, cached.zoomLevel(), 0.001);
        assertEquals(16, cached.editorFontSize());
        assertEquals("Consolas", cached.editorFontFamily());
    }

    @Test
    void writeZoomLevelClampsAndCaches() {
        DesktopChromeStore.writeZoomLevel(99);
        assertEquals(5.0, DesktopChromeStore.snapshot().zoomLevel(), 0.001);
        DesktopChromeStore.writeZoomLevel(-99);
        assertEquals(-5.0, DesktopChromeStore.snapshot().zoomLevel(), 0.001);
    }

    @Test
    void normalizeUiSkinDefaultsToClassic() {
        assertEquals("classic", DesktopChromeStore.normalizeUiSkin(null));
        assertEquals("ide", DesktopChromeStore.normalizeUiSkin("IDE"));
    }

    @Test
    void normalizeLocaleRejectsUnknown() {
        assertEquals("zh-CN", DesktopChromeStore.normalizeLocale("zh-CN"));
        assertEquals("", DesktopChromeStore.normalizeLocale("fr-FR"));
        assertEquals("", DesktopChromeStore.normalizeLocale(null));
    }

    @Test
    void writePatchAcceptsBareThemeKeysForSkinAndPrimary() {
        JsonObject patch = new JsonObject();
        patch.addProperty("uiSkin", "ide");
        patch.addProperty("primary", "rose");
        patch.addProperty("appearance", "system");
        patch.addProperty("background", "warm");
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writePatch(patch);
        assertEquals("ide", snap.uiSkin());
        assertEquals("rose", snap.primary());
        assertEquals("#e11d48", snap.primaryHex());
        assertEquals("system", snap.appearance());
        assertEquals("warm", snap.background());
    }

    @Test
    void legacyThemeKeysStillAccepted() {
        JsonObject patch = new JsonObject();
        patch.addProperty("themeAppearance", "light");
        patch.addProperty("themePrimary", "violet");
        patch.addProperty("themeUiSkin", "classic");
        patch.addProperty("themeUiFont", "yahei");
        patch.addProperty("themeUiTextScale", "lg");
        patch.addProperty("themeUiDensity", "sm");
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writePatch(patch);
        assertEquals("light", snap.appearance());
        assertEquals("violet", snap.primary());
        assertEquals("classic", snap.uiSkin());
        assertEquals("yahei", snap.uiFont());
        assertEquals("lg", snap.uiTextScale());
        assertEquals("sm", snap.uiDensity());
    }

    @Test
    void normalizePrimaryAndAppearance() {
        assertEquals("violet", DesktopChromeStore.normalizePrimary("Violet"));
        assertEquals("blue", DesktopChromeStore.normalizePrimary("nope"));
        assertEquals("system", DesktopChromeStore.normalizeAppearance("SYSTEM"));
        assertEquals("cool", DesktopChromeStore.normalizeBackground("???"));
    }

    @Test
    void roundTripPersistsCanonicalFieldsAcrossCacheInvalidate() {
        JsonObject patch = new JsonObject();
        patch.addProperty("appearance", "dark");
        patch.addProperty("background", "slate");
        patch.addProperty("primary", "orange");
        patch.addProperty("uiSkin", "ide");
        patch.addProperty("locale", "en-US");
        patch.addProperty("editorFontSize", 18);
        patch.addProperty("editorFontFamily", "JetBrains Mono");
        DesktopChromeStore.writePatch(patch);

        DesktopChromeStore.invalidateCache();
        DesktopChromeStore.Snapshot reloaded = DesktopChromeStore.snapshot();
        assertEquals("dark", reloaded.appearance());
        assertEquals("slate", reloaded.background());
        assertEquals("orange", reloaded.primary());
        assertEquals("ide", reloaded.uiSkin());
        assertEquals("en-US", reloaded.locale());
        assertEquals(18, reloaded.editorFontSize());
        assertEquals("JetBrains Mono", reloaded.editorFontFamily());
        assertEquals("dark", reloaded.resolvedMode());
        assertTrue(reloaded.chromeBg().startsWith("#"));
    }

    @Test
    void paintSnapshotExposesPaintFieldsOnly() {
        JsonObject patch = new JsonObject();
        patch.addProperty("appearance", "dark");
        patch.addProperty("primary", "cyan");
        DesktopChromeStore.writePatch(patch);
        DesktopChromeStore.PaintSnapshot paint = DesktopChromeStore.paintSnapshot();
        assertEquals("dark", paint.appearance());
        assertEquals("cyan", paint.primary());
        assertEquals("#0891b2", paint.primaryHex());
        assertTrue(paint.chromeBg().startsWith("#"));
    }

    @Test
    void writePatchPersistsUiFontScaleAndDensity() {
        JsonObject patch = new JsonObject();
        patch.addProperty("uiFont", "yahei");
        patch.addProperty("uiTextScale", "lg");
        patch.addProperty("uiDensity", "sm");
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writePatch(patch);
        assertEquals("yahei", snap.uiFont());
        assertEquals("lg", snap.uiTextScale());
        assertEquals("sm", snap.uiDensity());

        DesktopChromeStore.invalidateCache();
        DesktopChromeStore.Snapshot reloaded = DesktopChromeStore.snapshot();
        assertEquals("yahei", reloaded.uiFont());
        assertEquals("lg", reloaded.uiTextScale());
        assertEquals("sm", reloaded.uiDensity());
        assertEquals("yahei", reloaded.paint().uiFont());
        assertEquals("lg", reloaded.paint().uiTextScale());
        assertEquals("sm", reloaded.paint().uiDensity());
    }

    @Test
    void writePatchPersistsCustomFontAndSize() {
        JsonObject patch = new JsonObject();
        patch.addProperty("uiFont", "custom");
        patch.addProperty("uiFontCustom", "Source Han Sans SC");
        patch.addProperty("uiTextScale", "custom");
        patch.addProperty("uiFontSizePx", 15.5);
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.writePatch(patch);
        assertEquals("custom", snap.uiFont());
        assertEquals("Source Han Sans SC", snap.uiFontCustom());
        assertEquals("custom", snap.uiTextScale());
        assertEquals(15.5, snap.uiFontSizePx());
        assertEquals("Source Han Sans SC", snap.paint().uiFontCustom());
        assertEquals(15.5, snap.paint().uiFontSizePx());

        DesktopChromeStore.invalidateCache();
        DesktopChromeStore.Snapshot reloaded = DesktopChromeStore.snapshot();
        assertEquals("custom", reloaded.uiFont());
        assertEquals("Source Han Sans SC", reloaded.uiFontCustom());
        assertEquals("custom", reloaded.uiTextScale());
        assertEquals(15.5, reloaded.uiFontSizePx());
    }

    @Test
    void normalizeUiFontAndScaleIds() {
        assertEquals("noto", DesktopChromeStore.normalizeUiFont("Noto"));
        assertEquals("system", DesktopChromeStore.normalizeUiFont("system"));
        assertEquals("sourceHan", DesktopChromeStore.normalizeUiFont("sourceHan"));
        assertEquals("harmony", DesktopChromeStore.normalizeUiFont("HarmonyOS"));
        assertEquals("custom", DesktopChromeStore.normalizeUiFont("custom"));
        assertEquals("", DesktopChromeStore.normalizeUiFont(""));
        assertEquals("noto", DesktopChromeStore.normalizeUiFont("Comic Sans"));
        assertEquals("sm", DesktopChromeStore.normalizeUiScaleId("SM"));
        assertEquals("custom", DesktopChromeStore.normalizeUiTextScaleId("CUSTOM"));
        assertEquals("md", DesktopChromeStore.normalizeUiScaleId("nope"));
        assertEquals("", DesktopChromeStore.normalizeUiScaleId(null));
        assertEquals("md", DesktopChromeStore.normalizeUiDensityId("custom"));
        assertEquals(15.5, DesktopChromeStore.clampUiFontSizePx(15.4));
        assertEquals(0.0, DesktopChromeStore.clampUiFontSizePx(0));
        assertEquals("Source Han Sans SC", DesktopChromeStore.sanitizeUiFontCustom("Source Han Sans SC"));
        assertEquals("Evil", DesktopChromeStore.sanitizeUiFontCustom("'Evil';"));
        assertEquals("", DesktopChromeStore.sanitizeUiFontCustom(""));
    }

    @Test
    void refreshResolvedModeFromOsKeepsSystemAppearance() {
        JsonObject patch = new JsonObject();
        patch.addProperty("appearance", "system");
        patch.addProperty("background", "cool");
        DesktopChromeStore.writePatch(patch);
        DesktopChromeStore.Snapshot after = DesktopChromeStore.refreshResolvedModeFromOs();
        assertEquals("system", after.appearance());
        assertTrue("light".equals(after.resolvedMode()) || "dark".equals(after.resolvedMode()));
    }

    @Test
    void refreshResolvedModeFromOsNoOpWhenAppearanceFixed() {
        JsonObject patch = new JsonObject();
        patch.addProperty("appearance", "dark");
        DesktopChromeStore.writePatch(patch);
        String chromeBefore = DesktopChromeStore.snapshot().chromeBg();
        DesktopChromeStore.Snapshot after = DesktopChromeStore.refreshResolvedModeFromOs();
        assertEquals("dark", after.appearance());
        assertEquals("dark", after.resolvedMode());
        assertEquals(chromeBefore, after.chromeBg());
    }
}

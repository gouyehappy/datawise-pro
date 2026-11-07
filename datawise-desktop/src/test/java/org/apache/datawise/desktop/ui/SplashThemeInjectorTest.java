package org.apache.datawise.desktop.ui;

import com.google.gson.JsonObject;
import org.apache.datawise.desktop.prefs.DesktopChromeStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SplashThemeInjectorTest {
    @AfterEach
    void tearDown() {
        DesktopChromeStore.invalidateCache();
    }

    @Test
    void seedStyleBlockContainsThemeVariables() {
        String block = SplashThemeInjector.seedStyleBlock();
        assertTrue(block.contains("dw-host-theme-seed"));
        assertTrue(block.contains("dw-host-paint-seed"));
        assertTrue(block.contains("dw-host-shell-seed"));
        assertTrue(block.contains("background-color"));
        assertTrue(block.contains("data-theme"));
        assertTrue(block.contains("color-scheme"));
        assertTrue(block.contains("dw-cli-theme-prefs"));
        assertTrue(block.contains("--dw-primary"));
        assertTrue(block.contains("data-ui-font"));
        assertTrue(block.contains("data-ui-text-scale"));
        assertTrue(block.contains("data-ui-density"));
    }

    @Test
    void earlyPaintJsSeedsPrefs() {
        String js = SplashThemeInjector.earlyPaintJs();
        assertTrue(js.contains("dw-cli-theme-prefs"));
        assertTrue(js.contains("data-theme"));
        assertTrue(js.contains("uiFont"));
        assertTrue(js.contains("uiTextScale"));
        assertTrue(js.contains("uiDensity"));
        assertFalse(js.contains("</script>"));
    }

    @Test
    void paintSeedJsMergesBlankHostShellPrefsFromLocalStorage() {
        // Cold-start merge: blank host fields fall back to prior dw-cli-theme-prefs.
        String js = SplashThemeInjector.paintSeedJs(DesktopChromeStore.paintSnapshot());
        assertTrue(js.contains("prev=JSON.parse"));
        assertTrue(js.contains("seeded.uiFont"));
        assertTrue(js.contains("seeded.uiTextScale"));
        assertTrue(js.contains("seeded.uiDensity"));
        assertTrue(js.contains("data-ui-font"));
        assertTrue(js.contains("data-ui-text-scale"));
        assertTrue(js.contains("data-ui-density"));
        assertTrue(js.contains("--dw-font"));
        assertTrue(js.contains("Noto Sans SC"));
    }

    @Test
    void paintSeedJsEmitsPersistedShellPrefs() {
        JsonObject patch = new JsonObject();
        patch.addProperty("uiFont", "segoe");
        patch.addProperty("uiTextScale", "sm");
        patch.addProperty("uiDensity", "lg");
        DesktopChromeStore.writePatch(patch);
        String js = SplashThemeInjector.paintSeedJs(DesktopChromeStore.paintSnapshot());
        assertTrue(js.contains("uiFont:\"segoe\""));
        assertTrue(js.contains("uiTextScale:\"sm\""));
        assertTrue(js.contains("uiDensity:\"lg\""));
        assertTrue(js.contains("data-ui-font"));
        assertTrue(js.contains("data-ui-density"));
        assertTrue(js.contains("--dw-font"));
        assertTrue(js.contains("stacks[seeded.uiFont]") || js.contains("fontStack=stacks[seeded.uiFont]"));
    }

    @Test
    void paintSeedJsEmitsCustomFontAndSizeFromHost() {
        JsonObject patch = new JsonObject();
        patch.addProperty("uiFont", "custom");
        patch.addProperty("uiFontCustom", "Source Han Sans SC");
        patch.addProperty("uiTextScale", "custom");
        patch.addProperty("uiFontSizePx", 16);
        DesktopChromeStore.writePatch(patch);
        String js = SplashThemeInjector.paintSeedJs(DesktopChromeStore.paintSnapshot());
        assertTrue(js.contains("uiFont:\"custom\""));
        assertTrue(js.contains("Source Han Sans SC"));
        assertTrue(js.contains("uiTextScale:\"custom\""));
        assertTrue(js.contains("uiFontSizePx:16") || js.contains("uiFontSizePx:16.0"));
        assertTrue(js.contains("--dw-font-size"));
    }
}

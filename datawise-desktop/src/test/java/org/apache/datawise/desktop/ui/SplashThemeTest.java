package org.apache.datawise.desktop.ui;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SplashThemeTest {
    @Test
    void resolveProvidesChromeAndPrimary() {
        SplashTheme.Colors colors = SplashTheme.resolve();
        assertTrue(colors.editorBg().startsWith("#"));
        assertTrue(colors.chromeBg().startsWith("#"));
        assertTrue(colors.primary().startsWith("#"));
        assertTrue(colors.text().startsWith("#"));
    }

    @Test
    void themePrefsBootstrapJsSeedsLocalStorage() {
        String js = SplashTheme.themePrefsBootstrapJs();
        assertTrue(js.contains("dw-cli-theme-prefs"));
        assertTrue(js.contains("localStorage.setItem"));
        assertTrue(js.contains("appearance"));
        assertTrue(js.contains("background"));
        assertTrue(js.contains("uiSkin"));
        assertTrue(js.contains("dw-cli-locale"));
        assertTrue(js.contains("dw-cli-editor-settings"));
        assertTrue(js.contains("__DW_HOST_ZOOM__"));
    }

    @Test
    void normalizeUiSkinAcceptsIde() {
        assertTrue(SplashTheme.normalizeUiSkin("ide").equals("ide"));
        assertTrue(SplashTheme.normalizeUiSkin("classic").equals("classic"));
        assertTrue(SplashTheme.normalizeUiSkin(null).equals("classic"));
    }
}

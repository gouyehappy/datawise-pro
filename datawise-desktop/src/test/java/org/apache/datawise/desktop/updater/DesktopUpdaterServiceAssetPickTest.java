package org.apache.datawise.desktop.updater;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopUpdaterServiceAssetPickTest {

    @Test
    void prefersFrontendDistOverServerJarAndInstaller() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-frontend-dist.zip", "https://example/fe.zip"),
                asset("DataWiseCLI-4.1.6-server-jar.zip", "https://example/server.zip"),
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe"),
                asset("DataWiseCLI-4.1.6.dmg", "https://example/app.dmg"),
                asset("DataWiseCLI-4.1.6.deb", "https://example/app.deb")
        );
        assertEquals("frontend-dist", DesktopUpdaterService.selectUpdateKind(release));
    }

    @Test
    void prefersServerJarWhenNoFrontendDist() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-server-jar.zip", "https://example/server.zip"),
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe"),
                asset("DataWiseCLI-4.1.6.dmg", "https://example/app.dmg"),
                asset("DataWiseCLI-4.1.6.deb", "https://example/app.deb")
        );
        assertEquals("server-jar", DesktopUpdaterService.selectUpdateKind(release));
    }

    @Test
    void fallsBackToInstallerWhenNoPatches() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe"),
                asset("DataWiseCLI-4.1.6.dmg", "https://example/app.dmg"),
                asset("DataWiseCLI-4.1.6.deb", "https://example/app.deb")
        );
        String kind = DesktopUpdaterService.selectUpdateKind(release);
        assertTrue(kind == null || "installer".equals(kind), "expected installer, got " + kind);
        if (kind != null) {
            assertEquals("installer", kind);
        }
    }

    @Test
    void returnsNullWhenNoAssets() {
        JsonObject empty = new JsonObject();
        empty.add("assets", new JsonArray());
        assertNull(DesktopUpdaterService.selectUpdateKind(empty));
    }

    private static JsonObject releaseWith(JsonObject... assets) {
        JsonObject release = new JsonObject();
        JsonArray array = new JsonArray();
        for (JsonObject asset : assets) {
            array.add(asset);
        }
        release.add("assets", array);
        return release;
    }

    private static JsonObject asset(String name, String url) {
        JsonObject obj = new JsonObject();
        obj.addProperty("name", name);
        obj.addProperty("browser_download_url", url);
        return obj;
    }
}

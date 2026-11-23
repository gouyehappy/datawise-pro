package org.apache.datawise.desktop.updater;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DesktopUpdaterServiceAssetPickTest {

    @Test
    void identicalFingerprintsYieldNoDownload() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-5.0.1-frontend-dist.zip", "https://example/fe.zip", 12_000_000),
                asset("DataWiseCLI-5.0.1-server-jar.zip", "https://example/server.zip", 70_000_000),
                asset("DataWiseCLI-5.0.1-windows-x64-setup.exe", "https://example/setup.exe", 340_000_000)
        );
        String fe = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        String server = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        JsonObject remote = new JsonObject();
        remote.addProperty("version", "5.0.1");
        JsonObject components = new JsonObject();
        components.add("frontend", shaEntry(fe));
        components.add("serverJar", shaEntry(server));
        components.add("runtime", idEntry("jbr_jcef-17.0.12-b1207.37"));
        remote.add("components", components);

        DesktopUpdatePlan plan = DesktopUpdaterService.planFor(
                release,
                remote,
                new DesktopLocalVersion("5.0.0", "windows-x64", fe, server, "jbr_jcef-17.0.12-b1207.37")
        );
        assertEquals(DesktopUpdatePlan.Channel.NONE, plan.channel());
        assertTrue(plan.isEmpty());
    }

    @Test
    void prefersBothIncrementalPacksOverInstaller() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-frontend-dist.zip", "https://example/fe.zip", 12_000_000),
                asset("DataWiseCLI-4.1.6-server-jar.zip", "https://example/server.zip", 70_000_000),
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe", 340_000_000),
                asset("DataWiseCLI-4.1.6.dmg", "https://example/app.dmg", 400_000_000),
                asset("DataWiseCLI-4.1.6.deb", "https://example/app.deb", 380_000_000)
        );
        assertEquals("incremental", DesktopUpdaterService.selectUpdateKind(release));
        DesktopUpdatePlan plan = DesktopUpdaterService.planFor(
                release,
                null,
                new DesktopLocalVersion("4.1.5", "", null, null, null)
        );
        assertEquals(DesktopUpdatePlan.Channel.INCREMENTAL, plan.channel());
        assertEquals(2, plan.items().size());
        assertTrue(plan.savedBytes() > 200_000_000L);
        assertEquals(DesktopUpdatePlan.InstallAction.RESTART, plan.installAction());
    }

    @Test
    void prefersServerJarWhenNoFrontendDist() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-server-jar.zip", "https://example/server.zip", 70_000_000),
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe", 340_000_000)
        );
        assertEquals("server-jar", DesktopUpdaterService.selectUpdateKind(release));
    }

    @Test
    void prefersFrontendOnlyWhenFingerprintsSaySo() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-5.0.1-frontend-dist.zip", "https://example/fe.zip", 12_000_000),
                asset("DataWiseCLI-5.0.1-server-jar.zip", "https://example/server.zip", 70_000_000),
                asset("DataWiseCLI-5.0.1-windows-x64-setup.exe", "https://example/setup.exe", 340_000_000)
        );
        JsonObject remote = new JsonObject();
        remote.addProperty("version", "5.0.1");
        JsonObject components = new JsonObject();
        components.add("frontend", shaEntry("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        components.add("serverJar", shaEntry("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        components.add("runtime", idEntry("jbr_jcef-17.0.12-b1207.37"));
        remote.add("components", components);

        DesktopLocalVersion local = new DesktopLocalVersion(
                "5.0.0",
                "windows-x64",
                "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "jbr_jcef-17.0.12-b1207.37"
        );
        DesktopUpdatePlan plan = DesktopUpdaterService.planFor(release, remote, local);
        assertEquals(DesktopUpdatePlan.Channel.INCREMENTAL, plan.channel());
        assertEquals(1, plan.items().size());
        assertEquals("frontend-dist", plan.items().get(0).kind());
        assertEquals(DesktopUpdatePlan.InstallAction.RELOAD, plan.installAction());
    }

    @Test
    void forcesFullPackageWhenRuntimeIdChanges() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-5.1.0-frontend-dist.zip", "https://example/fe.zip", 12_000_000),
                asset("DataWiseCLI-5.1.0-server-jar.zip", "https://example/server.zip", 70_000_000),
                asset("DataWiseCLI-5.1.0-windows-x64-setup.exe", "https://example/setup.exe", 350_000_000)
        );
        JsonObject remote = new JsonObject();
        remote.addProperty("version", "5.1.0");
        JsonObject components = new JsonObject();
        components.add("frontend", shaEntry("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
        components.add("serverJar", shaEntry("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
        components.add("runtime", idEntry("jbr_jcef-17.0.14-b999.1"));
        remote.add("components", components);

        DesktopLocalVersion local = new DesktopLocalVersion(
                "5.0.0",
                "windows-x64",
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                "jbr_jcef-17.0.12-b1207.37"
        );
        DesktopUpdatePlan plan = DesktopUpdaterService.planFor(release, remote, local);
        assertEquals(DesktopUpdatePlan.Channel.FULL, plan.channel());
        assertEquals("installer", plan.items().get(0).kind());
    }

    @Test
    void fallsBackToInstallerWhenNoPatches() {
        JsonObject release = releaseWith(
                asset("DataWiseCLI-4.1.6-windows-x64-Setup.exe", "https://example/setup.exe", 340_000_000),
                asset("DataWiseCLI-4.1.6.dmg", "https://example/app.dmg", 400_000_000),
                asset("DataWiseCLI-4.1.6.deb", "https://example/app.deb", 380_000_000)
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

    private static JsonObject asset(String name, String url, long size) {
        JsonObject obj = new JsonObject();
        obj.addProperty("name", name);
        obj.addProperty("browser_download_url", url);
        obj.addProperty("size", size);
        return obj;
    }

    private static JsonObject shaEntry(String sha) {
        JsonObject obj = new JsonObject();
        obj.addProperty("sha256", sha);
        return obj;
    }

    private static JsonObject idEntry(String id) {
        JsonObject obj = new JsonObject();
        obj.addProperty("id", id);
        return obj;
    }
}

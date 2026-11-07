package org.apache.datawise.desktop.process;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

class WindowsProcessRestarterTest {

    @Test
    void waitScriptPollsParentThenStartsProcess() {
        String ps = WindowsProcessRestarter.buildWaitAndStartScript(
                4242,
                "D:\\software\\DataWiseCLI\\DataWiseCLI.exe",
                "D:\\software\\DataWiseCLI",
                List.of()
        );
        assertTrue(ps.contains("Get-Process -Id 4242"));
        assertTrue(ps.contains("Start-Sleep -Milliseconds 200"));
        assertTrue(ps.contains("Start-Process -FilePath 'D:\\software\\DataWiseCLI\\DataWiseCLI.exe'"));
        assertTrue(ps.contains("-WorkingDirectory 'D:\\software\\DataWiseCLI'"));
        assertFalse(ps.contains("-ArgumentList"));
    }

    @Test
    void waitScriptEscapesSingleQuotesInPaths() {
        String ps = WindowsProcessRestarter.buildWaitAndStartScript(
                1,
                "C:\\O'Brien\\app.exe",
                "C:\\O'Brien",
                List.of("-Dfoo=bar")
        );
        assertTrue(ps.contains("'C:\\O''Brien\\app.exe'"));
        assertTrue(ps.contains("-ArgumentList @('-Dfoo=bar')"));
    }

    @Test
    void preferPackagedExeReplacesWhenPresent() {
        List<String> original = List.of("java", "-jar", "app.jar");
        assertEquals(original, WindowsProcessRestarter.preferPackagedExe(
                Path.of("C:\\definitely-missing-datawise-install"),
                original
        ));
    }

    @Test
    void watcherLaunchLineUsesHiddenWscript(@TempDir Path dir) throws Exception {
        Path script = dir.resolve("relaunch-once.vbs");
        Files.writeString(script, "WScript.Quit 0\r\n");
        String line = WindowsProcessRestarter.buildWatcherLaunchLine(script);
        assertTrue(line.toLowerCase().contains("wscript"));
        assertTrue(line.contains("//B"));
        assertTrue(line.contains("//Nologo"));
        assertTrue(line.contains("\"" + script.toAbsolutePath().normalize() + "\"")
                || line.contains(script.getFileName().toString()));
    }

    @Test
    void vbsWatcherWaitsForParentThenRunsExe() {
        String vbs = WindowsProcessRestarter.buildVbsWatcher(
                4242,
                "D:\\software\\DataWiseCLI\\DataWiseCLI.exe",
                "D:\\software\\DataWiseCLI",
                List.of()
        );
        assertTrue(vbs.contains("Const parentPid = 4242"));
        assertTrue(vbs.contains("Win32_Process WHERE ProcessId="));
        assertTrue(vbs.contains("WScript.Sleep 200"));
        assertTrue(vbs.contains("D:\\software\\DataWiseCLI\\DataWiseCLI.exe"));
        assertTrue(vbs.contains("sh.Run cmdline, 1, False"));
        assertFalse(vbs.contains("cmd.exe"));
    }

    /**
     * End-to-end without packaging: WMI watcher must survive parent death and run the target.
     */
    @Test
    @EnabledOnOs(OS.WINDOWS)
    void wmiWatcherLaunchesTargetAfterParentExits() throws Exception {
        Path dir = Files.createTempDirectory("dw-relaunch-it-");
        Path marker = dir.resolve("relaunched.flag");
        Path target = dir.resolve("write-marker.cmd");
        Files.writeString(target,
                "@echo off\r\necho ok> \"" + marker.toAbsolutePath() + "\"\r\n",
                StandardCharsets.UTF_8);

        Process sleeper = new ProcessBuilder(
                "cmd.exe", "/c", "ping -n 120 127.0.0.1 >nul"
        ).start();
        long parentPid = sleeper.pid();

        try {
            WindowsProcessRestarter.ScheduleResult result = WindowsProcessRestarter.scheduleAfterPidExits(
                    parentPid,
                    dir,
                    List.of(target.toAbsolutePath().normalize().toString())
            );
            assertTrue(result.method().startsWith("wmi"),
                    "expected WMI watcher, got method=" + result.method());
            assertTrue(result.watcherPid() > 0, "watcher pid");

            sleeper.destroyForcibly();
            sleeper.waitFor(5, TimeUnit.SECONDS);

            long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
            while (System.nanoTime() < deadline && !Files.isRegularFile(marker)) {
                Thread.sleep(200);
            }
            if (!Files.isRegularFile(marker)) {
                fail("marker not created — WMI watcher did not start target after parent exit");
            }
        } finally {
            sleeper.destroyForcibly();
            // Best-effort; Windows may briefly lock the dir after start.
            try {
                Thread.sleep(500);
                Files.walk(dir)
                        .sorted((a, b) -> b.compareTo(a))
                        .forEach(p -> {
                            try {
                                Files.deleteIfExists(p);
                            } catch (Exception ignored) {
                            }
                        });
            } catch (Exception ignored) {
            }
        }
    }
}

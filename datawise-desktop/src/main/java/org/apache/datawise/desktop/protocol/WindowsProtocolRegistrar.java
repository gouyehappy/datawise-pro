package org.apache.datawise.desktop.protocol;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

/**
 * Registers {@code datawise://} protocol handler on Windows via registry.
 */
public final class WindowsProtocolRegistrar {
    private WindowsProtocolRegistrar() {
    }

    public static void registerIfWindows(Path executableOrJarLauncher) {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (!os.contains("win")) {
            return;
        }
        try {
            String command = buildCommand(executableOrJarLauncher);
            runReg("add", "HKCU\\Software\\Classes\\datawise", "/ve", "/d", "URL:DataWise Deep Link", "/f");
            runReg("add", "HKCU\\Software\\Classes\\datawise", "/v", "URL Protocol", "/d", "", "/f");
            runReg("add", "HKCU\\Software\\Classes\\datawise\\shell\\open\\command",
                    "/ve", "/d", command, "/f");
        } catch (Exception e) {
            System.err.println("[datawise-desktop] failed to register datawise:// : " + e.getMessage());
        }
    }

    private static String buildCommand(Path launcher) {
        String path = launcher.toAbsolutePath().normalize().toString().replace("\"", "\\\"");
        String lower = path.toLowerCase();
        if (lower.endsWith(".jar")) {
            String java = Path.of(System.getProperty("java.home"), "bin", "javaw.exe").toString();
            return "\"" + java + "\" -jar \"" + path + "\" \"%1\"";
        }
        if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
            return "cmd.exe /c \"\"" + path + "\" \"%1\"\"";
        }
        return "\"" + path + "\" \"%1\"";
    }

    private static void runReg(String... args) throws Exception {
        String[] cmd = new String[args.length + 1];
        cmd[0] = "reg";
        System.arraycopy(args, 0, cmd, 1, args.length);
        Process process = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            while (reader.readLine() != null) {
                // drain
            }
        }
        process.waitFor();
    }
}

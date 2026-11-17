package org.apache.datawise.desktop.protocol;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
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

    static String buildCommand(Path launcher) {
        Path absolute = launcher.toAbsolutePath().normalize();
        String path = absolute.toString().replace("\"", "");
        String lower = path.toLowerCase();
        if (lower.endsWith(".jar")) {
            String java = Path.of(System.getProperty("java.home"), "bin", "javaw.exe")
                    .toAbsolutePath()
                    .normalize()
                    .toString()
                    .replace("\"", "");
            // Prefer CreateProcess-friendly quoting; URL stays a single "%1" argument.
            return "\"" + java + "\" -jar \"" + path + "\" -- \"%1\"";
        }
        if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
            // Prefer sibling .exe to avoid cmd.exe /c URL metacharacter injection (DT-06).
            String withoutExt = path.substring(0, path.length() - 4);
            Path siblingExe = Path.of(withoutExt + ".exe");
            if (Files.isRegularFile(siblingExe)) {
                return "\"" + siblingExe.toAbsolutePath().normalize().toString().replace("\"", "") + "\" -- \"%1\"";
            }
            // Fallback: invoke via cmd with /d /s and a single quoted call; still prefer shipping .exe.
            return "cmd.exe /d /s /c \"call \"" + path + "\" -- \"%1\"\"";
        }
        return "\"" + path + "\" -- \"%1\"";
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

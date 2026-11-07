package org.apache.datawise.desktop.process;

import com.sun.jna.Native;
import com.sun.jna.platform.win32.Kernel32;
import com.sun.jna.platform.win32.WinBase;
import com.sun.jna.platform.win32.WinDef;
import com.sun.jna.platform.win32.WinUser;
import com.sun.jna.ptr.IntByReference;
import org.apache.datawise.desktop.DesktopPaths;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Windows intentional-restart helper for jpackage / Job-Object hosts.
 *
 * <p>The watcher must outlive this process, so it is created by WMI
 * ({@code Win32_Process.Create} under {@code WmiPrvSE}, outside our Job).
 * The watcher itself is {@code wscript.exe} (Windows subsystem — no console)
 * with {@code Win32_ProcessStartup.ShowWindow=0}, so nothing flashes on screen.
 */
final class WindowsProcessRestarter {
    private static final int CREATE_BREAKAWAY_FROM_JOB = 0x01000000;
    private static final int CREATE_NEW_PROCESS_GROUP = 0x00000200;
    private static final int CREATE_NO_WINDOW = 0x08000000;
    private static final int ERROR_ACCESS_DENIED = 5;
    private static final int WAIT_OBJECT_0 = 0;
    private static final int WAIT_TIMEOUT = 0x00000102;

    record ScheduleResult(long watcherPid, String method) {
    }

    private WindowsProcessRestarter() {
    }

    static boolean isSupported() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }

    /**
     * Schedule restart of {@code command} after {@code parentPid} exits.
     */
    static ScheduleResult scheduleAfterPidExits(long parentPid, Path workDir, List<String> command)
            throws Exception {
        if (command == null || command.isEmpty()) {
            throw new IllegalArgumentException("empty relaunch command");
        }
        if (parentPid <= 0) {
            throw new IllegalArgumentException("invalid parentPid: " + parentPid);
        }

        Path cwd = workDir != null
                ? workDir.toAbsolutePath().normalize()
                : Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        if (!Files.isDirectory(cwd)) {
            throw new IllegalStateException("workDir is not a directory: " + cwd);
        }

        String exe = Path.of(command.get(0)).toAbsolutePath().normalize().toString();
        List<String> args = command.size() > 1 ? command.subList(1, command.size()) : List.of();

        Path script = writeWatcherScript(parentPid, exe, cwd.toString(), args);
        String launchLine = buildWatcherLaunchLine(script);

        List<String> errors = new ArrayList<>();
        try {
            long pid = spawnWatcherViaWmi(launchLine);
            return new ScheduleResult(pid, "wmi-Win32_Process.Create");
        } catch (Exception ex) {
            errors.add("wmi: " + ex.getMessage());
        }
        try {
            spawnWatcherViaSchtasks(script);
            return new ScheduleResult(-1L, "schtasks");
        } catch (Exception ex) {
            errors.add("schtasks: " + ex.getMessage());
        }
        try {
            long pid = createProcessBreakaway(launchLine, cwd);
            return new ScheduleResult(pid, "breakaway-CreateProcess");
        } catch (IllegalStateException breakawayEx) {
            errors.add("breakaway: " + briefError(breakawayEx));
        }

        throw new IllegalStateException("all relaunch strategies failed: " + String.join(" | ", errors));
    }

    /**
     * PowerShell wait+start body (kept for tests / documentation of the wait contract).
     */
    static String buildWaitAndStartScript(long parentPid, String exe, String workDir, List<String> args) {
        String exeLit = psSingleQuoted(exe);
        String dirLit = psSingleQuoted(workDir);
        StringBuilder sb = new StringBuilder(256);
        sb.append("while (Get-Process -Id ").append(parentPid)
                .append(" -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }; ");
        sb.append("Start-Process -FilePath ").append(exeLit)
                .append(" -WorkingDirectory ").append(dirLit);
        if (args != null && !args.isEmpty()) {
            String argList = args.stream()
                    .map(WindowsProcessRestarter::psSingleQuoted)
                    .collect(Collectors.joining(", "));
            sb.append(" -ArgumentList @(").append(argList).append(')');
        }
        return sb.toString();
    }

    static String buildVbsWatcher(long parentPid, String exe, String workDir, List<String> args) {
        StringBuilder body = new StringBuilder(512);
        body.append("Option Explicit").append("\r\n");
        body.append("Dim sh, fso, svc, procs, exe, workDir, cmdline");
        if (args != null && !args.isEmpty()) {
            for (int i = 0; i < args.size(); i++) {
                body.append(", arg").append(i);
            }
        }
        body.append("\r\n");
        body.append("Const parentPid = ").append(parentPid).append("\r\n");
        body.append("exe = ").append(vbsString(exe)).append("\r\n");
        body.append("workDir = ").append(vbsString(workDir)).append("\r\n");
        if (args != null) {
            for (int i = 0; i < args.size(); i++) {
                body.append("arg").append(i).append(" = ").append(vbsString(args.get(i))).append("\r\n");
            }
        }
        body.append("Set sh = CreateObject(\"WScript.Shell\")").append("\r\n");
        body.append("Set fso = CreateObject(\"Scripting.FileSystemObject\")").append("\r\n");
        body.append("sh.CurrentDirectory = workDir").append("\r\n");
        body.append("Set svc = GetObject(\"winmgmts:\\\\.\\root\\cimv2\")").append("\r\n");
        body.append("Do").append("\r\n");
        body.append("  Set procs = svc.ExecQuery(\"SELECT ProcessId FROM Win32_Process WHERE ProcessId=\" & parentPid)").append("\r\n");
        body.append("  If procs.Count = 0 Then Exit Do").append("\r\n");
        body.append("  WScript.Sleep 200").append("\r\n");
        body.append("Loop").append("\r\n");
        // WScript.Shell.Run windowStyle=1 shows the GUI app; the watcher itself is wscript (no console).
        body.append("cmdline = \"\"\"\" & exe & \"\"\"\"").append("\r\n");
        if (args != null) {
            for (int i = 0; i < args.size(); i++) {
                body.append("cmdline = cmdline & \" \" & \"\"\"\" & arg")
                        .append(i)
                        .append(" & \"\"\"\"")
                        .append("\r\n");
            }
        }
        body.append("sh.Run cmdline, 1, False").append("\r\n");
        body.append("On Error Resume Next").append("\r\n");
        body.append("fso.DeleteFile WScript.ScriptFullName, True").append("\r\n");
        return body.toString();
    }

    static Path writeWatcherScript(long parentPid, String exe, String workDir, List<String> args)
            throws Exception {
        Path dir = DesktopPaths.userDataDir();
        Files.createDirectories(dir);
        Path script = dir.resolve("relaunch-once.vbs");
        Files.writeString(script, buildVbsWatcher(parentPid, exe, workDir, args), StandardCharsets.UTF_8);
        return script.toAbsolutePath().normalize();
    }

    static String buildWatcherLaunchLine(Path script) {
        String path = script.toAbsolutePath().normalize().toString();
        return quoteWinPath(resolveWscript().toString())
                + " //B //Nologo "
                + quoteWinPathForced(path);
    }

    private static long createProcessBreakaway(String commandLine, Path cwd) {
        return createProcess(commandLine, cwd,
                CREATE_BREAKAWAY_FROM_JOB | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW,
                false, 0);
    }

    /**
     * Hidden helper in the current job (allowed to die with us). No breakaway flag,
     * so this does not hit ERROR_ACCESS_DENIED under jpackage.
     */
    private static int createProcessHiddenAndWait(String commandLine, Path cwd, int timeoutMs) {
        return (int) createProcess(commandLine, cwd, CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP,
                true, timeoutMs);
    }

    /**
     * @return process id when {@code wait} is false; exit code when {@code wait} is true
     */
    private static long createProcess(
            String commandLine,
            Path cwd,
            int flags,
            boolean wait,
            int timeoutMs
    ) {
        char[] cmdBuf = Native.toCharArray(commandLine);
        WinBase.STARTUPINFO si = new WinBase.STARTUPINFO();
        si.dwFlags = WinBase.STARTF_USESHOWWINDOW;
        si.wShowWindow = new WinDef.WORD(WinUser.SW_HIDE);

        WinBase.PROCESS_INFORMATION pi = new WinBase.PROCESS_INFORMATION();
        boolean ok = Kernel32.INSTANCE.CreateProcessW(
                null,
                cmdBuf,
                null,
                null,
                false,
                new WinDef.DWORD(flags),
                null,
                cwd != null ? cwd.toString() : null,
                si,
                pi
        );
        if (!ok) {
            int err = Kernel32.INSTANCE.GetLastError();
            throw new IllegalStateException("CreateProcessW failed, GetLastError=" + err
                    + (err == ERROR_ACCESS_DENIED && (flags & CREATE_BREAKAWAY_FROM_JOB) != 0
                    ? " (job disallows CREATE_BREAKAWAY_FROM_JOB)" : "")
                    + " cmd=" + commandLine);
        }
        try {
            if (!wait) {
                return pi.dwProcessId.longValue();
            }
            int waited = Kernel32.INSTANCE.WaitForSingleObject(pi.hProcess, timeoutMs);
            if (waited == WAIT_TIMEOUT) {
                Kernel32.INSTANCE.TerminateProcess(pi.hProcess, 1);
                throw new IllegalStateException("hidden process timed out: " + commandLine);
            }
            if (waited != WAIT_OBJECT_0) {
                throw new IllegalStateException("WaitForSingleObject=" + waited + " cmd=" + commandLine);
            }
            IntByReference code = new IntByReference();
            if (!Kernel32.INSTANCE.GetExitCodeProcess(pi.hProcess, code)) {
                throw new IllegalStateException("GetExitCodeProcess failed, GetLastError="
                        + Kernel32.INSTANCE.GetLastError());
            }
            return code.getValue();
        } finally {
            Kernel32.INSTANCE.CloseHandle(pi.hThread);
            Kernel32.INSTANCE.CloseHandle(pi.hProcess);
        }
    }

    /**
     * Ask WMI to create a hidden {@code wscript} watcher outside our Job Object.
     * The helper is also {@code wscript} (Windows subsystem) so no console flashes.
     */
    private static long spawnWatcherViaWmi(String launchLine) throws Exception {
        Path dir = DesktopPaths.userDataDir();
        Files.createDirectories(dir);
        Path helper = dir.resolve("relaunch-wmi.vbs");
        Path pidFile = dir.resolve("relaunch-wmi.pid");
        Path errFile = dir.resolve("relaunch-wmi.err");
        Files.deleteIfExists(pidFile);
        Files.deleteIfExists(errFile);

        String body = String.join("\r\n",
                "Option Explicit",
                "Dim svc, startup, proc, rc, pid, fso, pidFile, errFile, cmd",
                "cmd = " + vbsString(launchLine),
                "pidFile = " + vbsString(pidFile.toAbsolutePath().normalize().toString()),
                "errFile = " + vbsString(errFile.toAbsolutePath().normalize().toString()),
                "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
                "On Error Resume Next",
                "Set svc = GetObject(\"winmgmts:\\\\.\\root\\cimv2\")",
                "If Err.Number <> 0 Then WriteErr Err.Description: WScript.Quit 1",
                "Set startup = svc.Get(\"Win32_ProcessStartup\").SpawnInstance_",
                "If Err.Number <> 0 Then WriteErr Err.Description: WScript.Quit 1",
                "startup.ShowWindow = 0",
                "startup.CreateFlags = 134217728",
                "Err.Clear",
                "Set proc = svc.Get(\"Win32_Process\")",
                "rc = proc.Create(cmd, Null, startup, pid)",
                "If Err.Number <> 0 Or rc <> 0 Or IsEmpty(pid) Then",
                "  Err.Clear",
                "  rc = proc.Create(cmd, Null, Null, pid)",
                "End If",
                "If rc <> 0 Or IsEmpty(pid) Then WriteErr \"Create rc=\" & rc: WScript.Quit 2",
                "Dim ts",
                "Set ts = fso.CreateTextFile(pidFile, True)",
                "ts.Write CStr(pid)",
                "ts.Close",
                "WScript.Quit 0",
                "Sub WriteErr(msg)",
                "  Dim ts2",
                "  Set ts2 = fso.CreateTextFile(errFile, True)",
                "  ts2.Write msg",
                "  ts2.Close",
                "End Sub"
        );
        Files.writeString(helper, body, StandardCharsets.UTF_8);

        String helperCmd = quoteWinPath(resolveWscript().toString())
                + " //B //Nologo "
                + quoteWinPathForced(helper.toAbsolutePath().normalize().toString());
        int exit = createProcessHiddenAndWait(helperCmd, dir, (int) TimeUnit.SECONDS.toMillis(20));
        String err = "";
        try {
            if (Files.isRegularFile(errFile)) {
                err = Files.readString(errFile, StandardCharsets.UTF_8).trim();
            }
        } catch (Exception ignored) {
        }
        try {
            Files.deleteIfExists(helper);
            Files.deleteIfExists(errFile);
        } catch (Exception ignored) {
        }
        if (exit != 0) {
            throw new IllegalStateException("WMI helper exit=" + exit + (err.isEmpty() ? "" : " " + err));
        }
        if (!Files.isRegularFile(pidFile)) {
            throw new IllegalStateException("WMI helper did not write ProcessId file"
                    + (err.isEmpty() ? "" : " " + err));
        }
        String raw = Files.readString(pidFile, StandardCharsets.US_ASCII).trim();
        try {
            Files.deleteIfExists(pidFile);
        } catch (Exception ignored) {
        }
        try {
            return Long.parseLong(raw.lines()
                    .map(String::trim)
                    .filter(s -> s.matches("\\d+"))
                    .reduce((a, b) -> b)
                    .orElseThrow());
        } catch (Exception ex) {
            throw new IllegalStateException("WMI helper did not return ProcessId; output=" + raw, ex);
        }
    }

    /**
     * Task Scheduler runs outside the app Job Object.
     */
    private static void spawnWatcherViaSchtasks(Path script) throws Exception {
        String taskName = "DataWiseCLI-Relaunch";
        String tr = buildWatcherLaunchLine(script);

        Process create = hiddenProcessBuilder(
                "schtasks.exe", "/Create", "/F",
                "/TN", taskName,
                "/TR", tr,
                "/SC", "ONCE",
                "/ST", "00:00"
        ).start();
        int createCode = waitQuietly(create, 15, TimeUnit.SECONDS);
        if (createCode != 0) {
            throw new IllegalStateException("schtasks /Create failed, exit=" + createCode);
        }

        Process run = hiddenProcessBuilder(
                "schtasks.exe", "/Run", "/TN", taskName
        ).start();
        int runCode = waitQuietly(run, 15, TimeUnit.SECONDS);
        if (runCode != 0) {
            throw new IllegalStateException("schtasks /Run failed, exit=" + runCode);
        }
    }

    private static ProcessBuilder hiddenProcessBuilder(String... command) {
        ProcessBuilder pb = new ProcessBuilder(command);
        pb.redirectErrorStream(true);
        pb.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        pb.redirectInput(ProcessBuilder.Redirect.PIPE);
        return pb;
    }

    private static int waitQuietly(Process process, long timeout, TimeUnit unit) throws Exception {
        boolean finished = process.waitFor(timeout, unit);
        if (!finished) {
            process.destroyForcibly();
            throw new IllegalStateException("process timed out");
        }
        return process.exitValue();
    }

    private static String briefError(IllegalStateException ex) {
        String msg = ex.getMessage();
        if (msg == null) {
            return ex.getClass().getSimpleName();
        }
        int cut = msg.indexOf(" cmd=");
        return cut > 0 ? msg.substring(0, cut) : msg;
    }

    private static String quoteWinPath(String path) {
        if (path.indexOf(' ') >= 0) {
            return "\"" + path + "\"";
        }
        return path;
    }

    private static String quoteWinPathForced(String path) {
        return "\"" + path + "\"";
    }

    private static Path resolveWscript() {
        return system32("wscript.exe");
    }

    private static Path system32(String... parts) {
        String root = System.getenv("SystemRoot");
        if (root == null || root.isBlank()) {
            root = "C:\\Windows";
        }
        Path p = Path.of(root, "System32");
        for (String part : parts) {
            p = p.resolve(part);
        }
        if (Files.isRegularFile(p)) {
            return p.toAbsolutePath().normalize();
        }
        return Path.of(parts[parts.length - 1]);
    }

    private static String psSingleQuoted(String value) {
        return "'" + value.replace("'", "''") + "'";
    }

    private static String vbsString(String value) {
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }

    static List<String> preferPackagedExe(Path workDir, List<String> command) {
        if (workDir == null || command == null || command.isEmpty()) {
            return command;
        }
        Path packaged = workDir.resolve("DataWiseCLI.exe");
        if (Files.isRegularFile(packaged)) {
            List<String> out = new ArrayList<>(1);
            out.add(packaged.toAbsolutePath().normalize().toString());
            return out;
        }
        return command;
    }
}

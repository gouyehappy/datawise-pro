package org.apache.datawise.desktop;

import com.sun.jna.Native;
import com.sun.jna.WString;
import com.sun.jna.platform.win32.Shell32;
import com.sun.jna.win32.StdCallLibrary;
import com.sun.jna.win32.W32APIOptions;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Windows branding helpers. Toast / Action Center headers follow the Start Menu
 * shortcut display name when the process AppUserModelID matches
 * {@code System.AppUserModel.ID} on that shortcut; otherwise Windows shows the raw AUMID.
 */
public final class WindowsAppBranding {
    public static final String APP_USER_MODEL_ID = "org.apache.datawise.DataWiseCLI";
    public static final String DISPLAY_NAME = "DataWise CLI";

    private WindowsAppBranding() {
    }

    public static void applyIfWindows(Path installRoot, Path preferredLauncher) {
        if (!System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win")) {
            return;
        }
        Path launcher = resolveLauncher(installRoot, preferredLauncher);
        boolean shortcutOk = false;
        try {
            shortcutOk = ensureStartMenuShortcut(installRoot, launcher);
        } catch (Throwable t) {
            System.err.println("[datawise-desktop] Start Menu shortcut skipped: " + t.getMessage());
        }
        // When no matching Start Menu shortcut exists (e.g. java.exe / IDE launch), using the
        // reverse-DNS AUMID makes Windows toast headers show the package id. Prefer the
        // human display name as a fallback so notifications stay branded.
        String aumid = shortcutOk ? APP_USER_MODEL_ID : DISPLAY_NAME;
        try {
            try {
                Shell32.INSTANCE.SetCurrentProcessExplicitAppUserModelID(new WString(aumid));
            } catch (Throwable ignored) {
                Shell32Ex.INSTANCE.SetCurrentProcessExplicitAppUserModelID(new WString(aumid));
            }
        } catch (Throwable t) {
            System.err.println("[datawise-desktop] AppUserModelID skipped: " + t.getMessage());
        }
    }

    private static Path resolveLauncher(Path installRoot, Path preferredLauncher) {
        if (preferredLauncher != null && Files.isRegularFile(preferredLauncher)) {
            return preferredLauncher;
        }
        Path exe = installRoot.resolve("DataWiseCLI.exe");
        if (Files.isRegularFile(exe)) {
            return exe;
        }
        Path cmd = installRoot.resolve("DataWiseCLI.cmd");
        return Files.isRegularFile(cmd) ? cmd : null;
    }

    /**
     * @return true when a Start Menu shortcut exists with matching AppUserModelID
     */
    private static boolean ensureStartMenuShortcut(Path installRoot, Path launcher) throws Exception {
        if (launcher == null) {
            return false;
        }

        Path programs = Path.of(System.getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs");
        Files.createDirectories(programs);
        Path shortcut = programs.resolve(DISPLAY_NAME + ".lnk");
        Path icon = installRoot.resolve("icons").resolve("icon.ico");

        Path script = DesktopPaths.userDataDir().resolve("ensure-shortcut.ps1");
        Files.createDirectories(script.getParent());
        String body = String.join("\n",
                "$ErrorActionPreference = 'Stop'",
                "$shortcutPath = '" + psEscape(shortcut.toAbsolutePath().toString()) + "'",
                "$targetPath = '" + psEscape(launcher.toAbsolutePath().toString()) + "'",
                "$workDir = '" + psEscape(installRoot.toAbsolutePath().toString()) + "'",
                "$iconPath = '" + psEscape(icon.toAbsolutePath().toString()) + "'",
                "$appId = '" + psEscape(APP_USER_MODEL_ID) + "'",
                "$w = New-Object -ComObject WScript.Shell",
                "$s = $w.CreateShortcut($shortcutPath)",
                "$s.TargetPath = $targetPath",
                "$s.WorkingDirectory = $workDir",
                "$s.Description = '" + psEscape(DISPLAY_NAME) + "'",
                "if (Test-Path -LiteralPath $iconPath) { $s.IconLocation = \"$iconPath,0\" }",
                "$s.Save()",
                "[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($s)",
                "[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($w)",
                "Add-Type -TypeDefinition @'",
                "using System;",
                "using System.Runtime.InteropServices;",
                "using System.Runtime.InteropServices.ComTypes;",
                "using System.Text;",
                "public static class DwShortcutAppId {",
                "  [ComImport, Guid(\"00021401-0000-0000-C000-000000000046\")]",
                "  private class ShellLinkCom { }",
                "  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid(\"000214F9-0000-0000-C000-000000000046\")]",
                "  private interface IShellLinkW {",
                "    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);",
                "    void GetIDList(out IntPtr ppidl);",
                "    void SetIDList(IntPtr pidl);",
                "    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);",
                "    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);",
                "    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);",
                "    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);",
                "    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);",
                "    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);",
                "    void GetHotkey(out short pwHotkey);",
                "    void SetHotkey(short wHotkey);",
                "    void GetShowCmd(out int piShowCmd);",
                "    void SetShowCmd(int iShowCmd);",
                "    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);",
                "    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);",
                "    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);",
                "    void Resolve(IntPtr hwnd, uint fFlags);",
                "    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);",
                "  }",
                "  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid(\"0000010b-0000-0000-C000-000000000046\")]",
                "  private interface IPersistFile {",
                "    void GetClassID(out Guid pClassID);",
                "    [PreserveSig] int IsDirty();",
                "    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);",
                "    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, [MarshalAs(UnmanagedType.Bool)] bool fRemember);",
                "    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);",
                "    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);",
                "  }",
                "  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid(\"886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99\")]",
                "  private interface IPropertyStore {",
                "    uint GetCount(out uint cProps);",
                "    uint GetAt(uint iProp, out PropertyKey pkey);",
                "    uint GetValue(ref PropertyKey key, out PropVariant pv);",
                "    uint SetValue(ref PropertyKey key, ref PropVariant pv);",
                "    uint Commit();",
                "  }",
                "  [StructLayout(LayoutKind.Sequential, Pack = 4)]",
                "  private struct PropertyKey { public Guid fmtid; public uint pid; }",
                "  [StructLayout(LayoutKind.Sequential)]",
                "  private struct PropVariant {",
                "    public ushort vt; public ushort w1; public ushort w2; public ushort w3; public IntPtr ptr;",
                "  }",
                "  public static void SetAppId(string path, string appId) {",
                "    var link = (IShellLinkW)new ShellLinkCom();",
                "    var file = (IPersistFile)link;",
                "    file.Load(path, 0);",
                "    var store = (IPropertyStore)link;",
                "    var key = new PropertyKey { fmtid = new Guid(\"9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3\"), pid = 5 };",
                "    var pv = new PropVariant { vt = 31, ptr = Marshal.StringToCoTaskMemUni(appId) };",
                "    try {",
                "      if (store.SetValue(ref key, ref pv) != 0) throw new Exception(\"SetValue failed\");",
                "      if (store.Commit() != 0) throw new Exception(\"Commit failed\");",
                "      file.Save(path, true);",
                "    } finally { Marshal.FreeCoTaskMem(pv.ptr); }",
                "  }",
                "}",
                "'@",
                "[DwShortcutAppId]::SetAppId($shortcutPath, $appId)",
                ""
        );
        Files.writeString(script, body, StandardCharsets.UTF_8);

        ProcessBuilder pb = new ProcessBuilder(
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy", "Bypass",
                "-File", script.toAbsolutePath().toString());
        pb.redirectErrorStream(true);
        Process p = pb.start();
        boolean finished = p.waitFor(20, TimeUnit.SECONDS);
        if (!finished) {
            p.destroyForcibly();
            return false;
        }
        return p.exitValue() == 0 && Files.isRegularFile(shortcut);
    }

    private static String psEscape(String value) {
        return value.replace("'", "''");
    }

    private interface Shell32Ex extends StdCallLibrary {
        Shell32Ex INSTANCE = Native.load("shell32", Shell32Ex.class, W32APIOptions.DEFAULT_OPTIONS);

        void SetCurrentProcessExplicitAppUserModelID(WString appID);
    }
}

package org.apache.datawise.backend.ai.analysis.python;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Python subprocess sandbox: static validation, isolated env, SQL result injection.
 *
 * <p>This is a denylist, not a security boundary. It stops the obvious escapes that a language
 * model produces by accident or on a naive prompt, and the subprocess runs with an isolated
 * interpreter ({@code -I}) and a scrubbed environment. It cannot stop a determined author:
 * {@code open('/etc/passwd')} only became unreachable because it is now listed here. Treat the
 * feature as "user runs their own analysis code", and keep it disabled for untrusted tenants
 * until the process runs inside a real OS-level sandbox.
 */
public final class PythonSandboxSupport {

    private static final List<Pattern> BLOCKED = List.of(
            Pattern.compile("(?i)\\bimport\\s+(os|sys|subprocess|socket|urllib|requests|shutil|ctypes|pickle|importlib|pathlib|multiprocessing|threading|signal|tempfile|glob|io|pty|mmap)\\b"),
            Pattern.compile("(?i)\\bfrom\\s+(os|sys|subprocess|socket|urllib|requests|shutil|ctypes|pickle|importlib|pathlib|multiprocessing|threading|signal|tempfile|glob|io|pty|mmap)\\s+import\\b"),
            Pattern.compile("(?i)\\bos\\.system\\s*\\("),
            Pattern.compile("(?i)\\bos\\.popen\\s*\\("),
            Pattern.compile("(?i)\\bsubprocess\\."),
            Pattern.compile("(?i)\\beval\\s*\\("),
            Pattern.compile("(?i)\\bexec\\s*\\("),
            Pattern.compile("(?i)__import__\\s*\\("),
            // Filesystem and introspection primitives that reach the host directly.
            Pattern.compile("(?i)\\b(open|breakpoint|compile|input|globals|locals|vars|getattr|setattr|delattr|memoryview)\\s*\\("),
            // The classic escape chain starts by walking dunder attributes
            // (__class__ -> __subclasses__ -> __init__.__globals__).
            Pattern.compile("\\b__[a-z_]+__\\b"),
            // Network / process APIs reachable without an import statement.
            Pattern.compile("(?i)\\bsys\\.modules\\b"));

    private static final String PREFIX = """
            import json
            from pathlib import Path
            _p = Path(__file__).resolve().parent / "sql_result.json"
            with _p.open(encoding="utf-8") as _f:
                _payload = json.load(_f)
            sql_result = _payload
            rows = _payload.get("rows") or []
            columns = _payload.get("columns") or []

            """;

    private PythonSandboxSupport() {
    }

    public static Optional<String> validateUserCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.of("Python code is empty");
        }
        for (Pattern pattern : BLOCKED) {
            if (pattern.matcher(code).find()) {
                return Optional.of("Blocked unsafe Python construct");
            }
        }
        return Optional.empty();
    }

    public static String wrapUserCode(String userCode) {
        return PREFIX + userCode.strip() + "\n";
    }

    public static Map<String, String> sandboxEnvironment() {
        Map<String, String> env = new LinkedHashMap<>();
        copy(env, "PATH");
        copy(env, "SYSTEMROOT");
        copy(env, "WINDIR");
        copy(env, "HOME");
        copy(env, "USERPROFILE");
        copy(env, "TEMP");
        copy(env, "TMP");
        env.put("PYTHONNOUSERSITE", "1");
        env.put("PYTHONDONTWRITEBYTECODE", "1");
        env.put("PYTHONHASHSEED", "0");
        return env;
    }

    public static List<String> buildPythonCommand(String pythonCommand, String scriptPath, boolean sandbox) {
        List<String> cmd = new ArrayList<>();
        cmd.add(pythonCommand != null && !pythonCommand.isBlank() ? pythonCommand : "python");
        if (sandbox) {
            cmd.add("-I");
            cmd.add("-B");
        }
        cmd.add(scriptPath);
        return cmd;
    }

    private static void copy(Map<String, String> env, String key) {
        String value = System.getenv(key);
        if (value != null && !value.isBlank()) {
            env.put(key, value);
        }
    }
}

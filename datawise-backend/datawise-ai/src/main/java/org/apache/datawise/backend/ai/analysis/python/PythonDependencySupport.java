package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.config.AiPythonProperties;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/** 从 Python 代码解析第三方依赖，并按白名单生成 requirements.txt / 安装命令。 */
public final class PythonDependencySupport {

    private static final Pattern IMPORT = Pattern.compile(
            "(?m)^\\s*import\\s+([a-zA-Z_][\\w.]*)"
    );
    private static final Pattern FROM_IMPORT = Pattern.compile(
            "(?m)^\\s*from\\s+([a-zA-Z_][\\w.]*)\\s+import\\s+"
    );

    private static final Set<String> STDLIB = Set.of(
            "abc", "array", "ast", "asyncio", "base64", "bisect", "calendar", "collections",
            "copy", "csv", "dataclasses", "datetime", "decimal", "enum", "functools", "hashlib",
            "heapq", "html", "io", "itertools", "json", "logging", "math", "operator", "os",
            "pathlib", "pickle", "random", "re", "statistics", "string", "sys", "textwrap",
            "time", "typing", "uuid", "warnings", "xml", "zoneinfo"
    );

    private static final Map<String, String> MODULE_TO_PACKAGE = Map.ofEntries(
            Map.entry("sklearn", "scikit-learn"),
            Map.entry("cv2", "opencv-python"),
            Map.entry("PIL", "Pillow"),
            Map.entry("yaml", "PyYAML"),
            Map.entry("bs4", "beautifulsoup4")
    );

    private PythonDependencySupport() {
    }

    public static List<String> resolveAllowedPackages(String code, AiPythonProperties properties) {
        if (!properties.isDependencyInstallEnabled() || code == null || code.isBlank()) {
            return List.of();
        }
        Set<String> allowed = properties.allowedPackageSet();
        LinkedHashSet<String> packages = new LinkedHashSet<>();
        for (String module : extractTopLevelModules(code)) {
            if (STDLIB.contains(module)) {
                continue;
            }
            String pipName = MODULE_TO_PACKAGE.getOrDefault(module, module);
            if (allowed.contains(pipName.toLowerCase(Locale.ROOT))) {
                packages.add(pipName);
            }
        }
        return List.copyOf(packages);
    }

    public static String requirementsContent(List<String> packages) {
        if (packages == null || packages.isEmpty()) {
            return "";
        }
        return packages.stream().distinct().collect(Collectors.joining("\n")) + "\n";
    }

    public static List<String> buildPipInstallCommand(
            String pipCommand,
            String requirementsPath,
            String targetDir
    ) {
        List<String> cmd = new ArrayList<>();
        cmd.add(pipCommand != null && !pipCommand.isBlank() ? pipCommand : "pip");
        cmd.add("install");
        cmd.add("--no-cache-dir");
        cmd.add("-q");
        cmd.add("-r");
        cmd.add(requirementsPath);
        cmd.add("-t");
        cmd.add(targetDir);
        return cmd;
    }

    /**
     * 容器内 shell：可选 pip install 后执行 python。
     *
     * @param workspaceMount 容器内工作区路径（如 /workspace）
     * @param depsDir        容器内依赖目录（如 /tmp/deps）
     */
    public static String buildContainerShell(
            boolean installDependencies,
            List<String> pythonCommand,
            String workspaceMount,
            String depsDir
    ) {
        StringBuilder shell = new StringBuilder();
        if (installDependencies) {
            shell.append("if [ -f ")
                    .append(workspaceMount)
                    .append("/requirements.txt ]; then ")
                    .append("pip install --no-cache-dir -q -r ")
                    .append(workspaceMount)
                    .append("/requirements.txt -t ")
                    .append(depsDir)
                    .append(" && export PYTHONPATH=")
                    .append(depsDir)
                    .append("; fi && ");
        }
        shell.append(String.join(" ", quoteShellArgs(pythonCommand)));
        return shell.toString();
    }

    static Set<String> extractTopLevelModules(String code) {
        LinkedHashSet<String> modules = new LinkedHashSet<>();
        collectModules(IMPORT, code, modules);
        collectModules(FROM_IMPORT, code, modules);
        return modules;
    }

    private static void collectModules(Pattern pattern, String code, Set<String> modules) {
        Matcher matcher = pattern.matcher(code);
        while (matcher.find()) {
            String raw = matcher.group(1);
            if (raw == null || raw.isBlank()) {
                continue;
            }
            String topLevel = raw.split("\\.")[0];
            modules.add(topLevel);
        }
    }

    private static List<String> quoteShellArgs(List<String> args) {
        List<String> quoted = new ArrayList<>(args.size());
        for (String arg : args) {
            if (arg.contains(" ") || arg.contains("'")) {
                quoted.add("'" + arg.replace("'", "'\\''") + "'");
            } else {
                quoted.add(arg);
            }
        }
        return quoted;
    }
}

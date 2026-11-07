package org.apache.datawise.backend.service;

import org.apache.datawise.backend.domain.TerminalExecResult;
import org.apache.datawise.backend.domain.TerminalStatusDto;
import org.apache.datawise.backend.terminal.TerminalPtySessionManager;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 浏览器演示终端：仅 {@code platform=web} 时由前端 Mock 面板调用。
 * JCEF 桌面版走 WebSocket PTY（{@code /ws/terminal}），不经过本 HTTP 演示路径。
 */
@Service
public class TerminalService {

    private final TerminalPtySessionManager ptySessionManager;
    private final boolean websocketEnabled;
    private final String websocketPath;

    public TerminalService(
            TerminalPtySessionManager ptySessionManager,
            @org.springframework.beans.factory.annotation.Value("${datawise.terminal.websocket.enabled:false}") boolean websocketEnabled,
            @org.springframework.beans.factory.annotation.Value("${datawise.terminal.websocket.path:/ws/terminal}") String websocketPath
    ) {
        this.ptySessionManager = ptySessionManager;
        this.websocketEnabled = websocketEnabled;
        this.websocketPath = websocketPath;
    }

    private static final Map<String, List<String>> MOCK_DIRS = Map.of(
            "~/datawise", List.of("datawise-cli", "datawise-backend", "datawise-frontend", "README.md"),
            "~/datawise/datawise-cli", List.of("src", "datawise-desktop", "package.json", "vite.config.ts")
    );

    public String welcome(String platform) {
        String label = platform != null && !platform.isBlank() ? platform : "web";
        boolean desktopHost = label.contains("desktop")
                || label.contains("win32")
                || label.contains("darwin")
                || label.contains("linux");
        if (websocketEnabled && ptySessionManager.isPtyAvailable()) {
            return desktopHost
                    ? "DataWise Terminal — 本机系统 Shell（服务端 PTY）"
                    : "DataWise Terminal (WebSocket PTY) — 已连接服务端 Shell";
        }
        if (desktopHost) {
            return "DataWise Terminal (demo) — 本机 PTY 未启用，输入 help 查看演示命令";
        }
        return "DataWise Terminal (demo) — 浏览器演示模式，输入 help 查看命令；完整 Shell 请使用桌面版";
    }

    public TerminalStatusDto status() {
        boolean ptyAvailable = ptySessionManager.isPtyAvailable();
        return new TerminalStatusDto(
                websocketEnabled,
                websocketEnabled && ptyAvailable,
                websocketPath
        );
    }

    public TerminalExecResult execute(String input, String cwd, String platform) {
        String currentCwd = cwd != null && !cwd.isBlank() ? cwd : "~/datawise";
        String trimmed = input != null ? input.trim() : "";
        if (trimmed.isEmpty()) {
            return new TerminalExecResult(List.of(), currentCwd);
        }

        String[] parts = trimmed.split("\\s+");
        String cmd = parts[0].toLowerCase();
        List<String> args = new ArrayList<>();
        if (parts.length > 1) {
            for (int i = 1; i < parts.length; i++) {
                args.add(parts[i]);
            }
        }

        switch (cmd) {
            case "help":
                return lines(currentCwd, List.of(
                        line("out", "help        显示帮助"),
                        line("out", "clear       清屏"),
                        line("out", "pwd         当前目录"),
                        line("out", "ls          列出文件"),
                        line("out", "cd <path>   切换目录"),
                        line("out", "echo <text> 输出文本"),
                        line("out", "date        当前时间"),
                        line("out", "mysql       连接 MySQL 提示"),
                        line("out", "node -v     Node 版本"),
                        line("out", "npm -v      npm 版本")
                ));
            case "clear":
                return lines(currentCwd, List.of(line("sys", "__CLEAR__")));
            case "pwd":
                return lines(currentCwd, List.of(line("out", currentCwd)));
            case "ls": {
                List<String> list = MOCK_DIRS.get(normalizeCwd(currentCwd));
                if (list == null) {
                    return lines(currentCwd, List.of(line("err", "ls: cannot access '" + currentCwd + "': No such directory")));
                }
                return lines(currentCwd, List.of(line("out", String.join("  ", list))));
            }
            case "cd": {
                String target = args.isEmpty() ? "~" : args.get(0);
                String next = resolvePath(currentCwd, target);
                if (!MOCK_DIRS.containsKey(normalizeCwd(next)) && !"~/datawise".equals(next)) {
                    return lines(currentCwd, List.of(line("err", "cd: " + target + ": No such file or directory")));
                }
                return new TerminalExecResult(List.of(), next);
            }
            case "echo":
                return lines(currentCwd, List.of(line("out", String.join(" ", args))));
            case "date":
                return lines(currentCwd, List.of(line("out", Instant.now().toString())));
            case "node":
                if (!args.isEmpty() && ("-v".equals(args.get(0)) || "--version".equals(args.get(0)))) {
                    return lines(currentCwd, List.of(line("out", "v22.14.0")));
                }
                break;
            case "npm":
                if (!args.isEmpty() && ("-v".equals(args.get(0)) || "--version".equals(args.get(0)))) {
                    return lines(currentCwd, List.of(line("out", "10.9.2")));
                }
                break;
            case "mysql":
                return lines(currentCwd, List.of(
                        line("out", "Tip: 在左侧连接树新建 MySQL 连接，或在 SQL 控制台执行查询。"),
                        line("out", "Example: mysql -h localhost -P 3306 -u root -p")
                ));
            case "whoami":
                return lines(currentCwd, List.of(line("out", "datawise")));
            default:
                break;
        }

        return lines(currentCwd, List.of(line("err", cmd + ": command not found")));
    }

    private TerminalExecResult lines(String cwd, List<Map<String, String>> lines) {
        return new TerminalExecResult(lines, cwd);
    }

    private Map<String, String> line(String type, String text) {
        Map<String, String> map = new HashMap<>();
        map.put("type", type);
        map.put("text", text);
        return map;
    }

    private String normalizeCwd(String cwd) {
        return cwd.replace("\\", "/");
    }

    private String resolvePath(String cwd, String target) {
        String base = normalizeCwd(cwd);
        if ("~".equals(target)) {
            return "~/datawise";
        }
        if (target.startsWith("~/")) {
            return target;
        }
        if ("..".equals(target)) {
            String[] parts = base.split("/");
            if (parts.length <= 2) {
                return base;
            }
            return String.join("/", List.of(parts).subList(0, parts.length - 1));
        }
        if (target.startsWith("/")) {
            return target;
        }
        return (base + "/" + target).replaceAll("/+", "/");
    }
}

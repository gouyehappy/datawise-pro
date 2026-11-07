package org.apache.datawise.backend.common.support;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 解析 {@code datawise.config.dir}。
 * <ul>
 *   <li>绝对路径：始终使用该目录（创建缺失子目录），不回退到其它 config/</li>
 *   <li>相对路径 {@code config}：兼容开发态，可从 cwd 向上查找含连接/驱动的 config/</li>
 *   <li>其它相对路径：相对 cwd 解析并创建，不偷用别的目录</li>
 * </ul>
 */
public final class ConfigDirectoryLocator {

    private ConfigDirectoryLocator() {
    }

    public static Path resolve(String configuredDir) throws IOException {
        boolean blank = configuredDir == null || configuredDir.isBlank();
        String raw = blank ? "config" : configuredDir.trim();
        Path configuredPath = Paths.get(raw);
        Path primary = normalize(raw);

        // 桌面偏好传入的绝对工作区：必须严格遵守
        if (configuredPath.isAbsolute()) {
            return ensureConfigRoot(primary);
        }

        if (isUsableConfigRoot(primary)) {
            return primary;
        }

        // 仅默认相对名 "config" 保留向上查找（mvn 从子模块目录启动）
        if ("config".equals(raw) || "./config".equals(raw) || ".\\config".equals(raw)) {
            Path walk = Paths.get("").toAbsolutePath().normalize();
            for (int depth = 0; depth < 8 && walk != null; depth++) {
                Path candidate = walk.resolve("config").normalize();
                if (isUsableConfigRoot(candidate)) {
                    return candidate;
                }
                walk = walk.getParent();
            }
        }

        return ensureConfigRoot(primary);
    }

    private static Path ensureConfigRoot(Path root) throws IOException {
        Path normalized = root.toAbsolutePath().normalize();
        Files.createDirectories(normalized);
        Files.createDirectories(normalized.resolve("drivers"));
        Files.createDirectories(normalized.resolve("plugins"));
        return normalized;
    }

    private static Path normalize(String configuredDir) {
        Path path = Paths.get(configuredDir != null && !configuredDir.isBlank() ? configuredDir.trim() : "config");
        if (!path.isAbsolute()) {
            path = Paths.get("").toAbsolutePath().normalize().resolve(path);
        }
        return path.normalize();
    }

    private static boolean isUsableConfigRoot(Path root) {
        if (root == null || !Files.isDirectory(root)) {
            return false;
        }
        if (Files.isRegularFile(root.resolve("connections.xml"))) {
            return true;
        }
        if (Files.isRegularFile(root.resolve("users.json")) || Files.isRegularFile(root.resolve("sessions.json"))) {
            return true;
        }
        Path tenantsConnections = root.resolve("tenants").resolve("default").resolve("connections.xml");
        if (Files.isRegularFile(tenantsConnections)) {
            return true;
        }
        Path drivers = root.resolve("drivers");
        if (!Files.isDirectory(drivers)) {
            return false;
        }
        try (var stream = Files.list(drivers)) {
            return stream.anyMatch(path -> Files.isRegularFile(path)
                    && path.getFileName().toString().toLowerCase().endsWith(".jar"));
        } catch (IOException ex) {
            return false;
        }
    }
}

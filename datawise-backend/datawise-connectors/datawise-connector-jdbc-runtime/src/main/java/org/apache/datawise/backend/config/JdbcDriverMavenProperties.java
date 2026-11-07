package org.apache.datawise.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * JDBC 驱动从 Maven 仓库下载的配置。可配置多个仓库，按顺序尝试（适合 Central 不可达时走国内镜像）。
 */
@ConfigurationProperties(prefix = "datawise.jdbc.maven")
public class JdbcDriverMavenProperties {

    public static final String MAVEN_CENTRAL = "https://repo1.maven.org/maven2";
    public static final String ALIYUN_CENTRAL = "https://maven.aliyun.com/repository/central";

    /**
     * Maven 仓库根 URL 列表（无末尾斜杠）。按顺序尝试下载；全部失败才报错。
     */
    private List<String> repositories = new ArrayList<>(List.of(MAVEN_CENTRAL, ALIYUN_CENTRAL));

    public List<String> getRepositories() {
        return repositories;
    }

    public void setRepositories(List<String> repositories) {
        if (repositories == null || repositories.isEmpty()) {
            this.repositories = new ArrayList<>(List.of(MAVEN_CENTRAL));
            return;
        }
        List<String> normalized = new ArrayList<>();
        for (String entry : repositories) {
            if (entry == null || entry.isBlank()) {
                continue;
            }
            String trimmed = entry.trim().replaceAll("/+$", "");
            if (!trimmed.isEmpty() && !normalized.contains(trimmed)) {
                normalized.add(trimmed);
            }
        }
        this.repositories = normalized.isEmpty()
                ? new ArrayList<>(List.of(MAVEN_CENTRAL))
                : normalized;
    }
}

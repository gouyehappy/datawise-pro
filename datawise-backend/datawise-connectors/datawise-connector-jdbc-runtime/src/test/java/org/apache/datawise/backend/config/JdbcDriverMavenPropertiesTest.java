package org.apache.datawise.backend.config;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcDriverMavenPropertiesTest {

    @Test
    void defaultsIncludeCentralAndAliyun() {
        JdbcDriverMavenProperties properties = new JdbcDriverMavenProperties();
        assertEquals(
                List.of(
                        JdbcDriverMavenProperties.MAVEN_CENTRAL,
                        JdbcDriverMavenProperties.ALIYUN_CENTRAL
                ),
                properties.getRepositories()
        );
    }

    @Test
    void setRepositoriesNormalizesAndDedupes() {
        JdbcDriverMavenProperties properties = new JdbcDriverMavenProperties();
        properties.setRepositories(List.of(
                " https://maven.aliyun.com/repository/public/ ",
                "https://maven.aliyun.com/repository/public",
                "",
                "https://repo.huaweicloud.com/repository/maven/"
        ));
        assertEquals(
                List.of(
                        "https://maven.aliyun.com/repository/public",
                        "https://repo.huaweicloud.com/repository/maven"
                ),
                properties.getRepositories()
        );
    }
}

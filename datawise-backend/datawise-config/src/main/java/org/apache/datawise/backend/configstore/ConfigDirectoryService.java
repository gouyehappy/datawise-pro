package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.config.DatawiseConfigProperties;
import org.apache.datawise.backend.common.support.ConfigDirectoryLocator;
import org.apache.datawise.backend.common.support.WorkspaceRoot;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class ConfigDirectoryService {

    private final Path configRoot;

    @Autowired
    public ConfigDirectoryService(DatawiseConfigProperties properties) throws IOException {
        this.configRoot = ConfigDirectoryLocator.resolve(properties.getDir());
        WorkspaceRoot.install(this.configRoot);
    }

    /**
     * 测试用：固定配置根目录
     */
    public ConfigDirectoryService(Path configRoot) {
        this.configRoot = configRoot.toAbsolutePath().normalize();
        WorkspaceRoot.install(this.configRoot);
    }

    public Path getRoot() {
        return configRoot;
    }

    public Path resolve(String filename) {
        return configRoot.resolve(filename).normalize();
    }

    public void ensureExists() throws IOException {
        Files.createDirectories(configRoot);
    }
}

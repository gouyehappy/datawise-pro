package org.apache.datawise.backend.lineage.store;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.LineageGraphDto;
import org.apache.datawise.backend.lineage.support.LineageSqlHash;
import org.apache.datawise.backend.service.viewmodel.ViewModelWorkspaceSupport;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Component
public class ViewModelLineageStore {

    static final String SIDECAR_SUFFIX = ".lineage.json";

    private final ViewModelWorkspaceSupport workspaceSupport;
    private final ObjectMapper objectMapper;

    public ViewModelLineageStore(ViewModelWorkspaceSupport workspaceSupport, ObjectMapper objectMapper) {
        this.workspaceSupport = workspaceSupport;
        this.objectMapper = objectMapper;
    }

    public Path sidecarPath(String connectionId, String instanceName, String fileName) {
        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(connectionId, instanceName);
        return viewModelsDir.resolve(fileName + SIDECAR_SUFFIX).normalize();
    }

    public LineageGraphDto read(String connectionId, String instanceName, String fileName) throws IOException {
        Path path = sidecarPath(connectionId, instanceName, fileName);
        if (!Files.isRegularFile(path)) {
            return null;
        }
        return objectMapper.readValue(Files.readString(path, StandardCharsets.UTF_8), LineageGraphDto.class);
    }

    public void write(String connectionId, String instanceName, String fileName, LineageGraphDto graph)
            throws IOException {
        Path path = sidecarPath(connectionId, instanceName, fileName);
        Files.createDirectories(path.getParent());
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), graph);
    }

    public void delete(String connectionId, String instanceName, String fileName) throws IOException {
        Path path = sidecarPath(connectionId, instanceName, fileName);
        Files.deleteIfExists(path);
    }

    public boolean isStale(LineageGraphDto cached, String sql) {
        if (cached == null || cached.meta() == null || sql == null) {
            return true;
        }
        return !LineageSqlHash.sha256(sql).equals(cached.meta().sqlHash());
    }
}

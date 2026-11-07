package org.apache.datawise.backend.service.instancesql;

import org.apache.datawise.backend.domain.InstanceSqlFileDto;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class InstanceSqlCatalogService {

    private final InstanceSqlWorkspaceSupport workspaceSupport;

    public InstanceSqlCatalogService(InstanceSqlWorkspaceSupport workspaceSupport) {
        this.workspaceSupport = workspaceSupport;
    }

    public List<TreeNode> listSqlFileNodes(String connectionId, String instanceName) throws IOException {
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName);
        if (!Files.isDirectory(workspaceDir)) {
            return List.of();
        }

        Map<String, TreeNode> uniqueByFileName = new LinkedHashMap<>();
        try (Stream<Path> stream = Files.list(workspaceDir)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .forEach(path -> {
                        String fileName = path.getFileName().toString();
                        String key = fileName.toLowerCase(Locale.ROOT);
                        uniqueByFileName.putIfAbsent(key, toSqlFileNode(connectionId, instanceName, fileName));
                    });
        }
        return new ArrayList<>(uniqueByFileName.values());
    }

    public List<InstanceSqlFileDto> listSqlScripts(
            String connectionId,
            String instanceName,
            boolean allConnections
    ) throws IOException {
        List<InstanceSqlFileDto> files = new ArrayList<>();
        Path baseDir = workspaceSupport.baseDir();
        if (allConnections) {
            if (!Files.isDirectory(baseDir)) {
                return List.of();
            }
            try (Stream<Path> connections = Files.list(baseDir)) {
                for (Path connectionPath : connections.filter(Files::isDirectory).toList()) {
                    String connId = connectionPath.getFileName().toString();
                    collectSqlScripts(connId, connectionPath, null, files);
                }
            }
        } else {
            if (connectionId == null || connectionId.isBlank()) {
                throw new IllegalArgumentException("connectionId is required");
            }
            if (instanceName == null || instanceName.isBlank()) {
                throw new IllegalArgumentException("instanceName is required");
            }
            Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceName.trim());
            appendWorkspaceScripts(connectionId, instanceName.trim(), workspaceDir, files);
        }
        files.sort(Comparator.comparingLong(InstanceSqlFileDto::modifiedAt).reversed());
        return files;
    }

    public TreeNode buildWorkspacesFolderNode(String connectionId, String catalog) {
        TreeNode folder = new TreeNode();
        folder.setId(SchemaNodeIds.nodeId("folder-ws", connectionId, catalog));
        folder.setLabel("workspaces");
        folder.setType("folder");
        folder.setExpanded(false);
        folder.setChildren(new ArrayList<>());
        return folder;
    }

    private TreeNode toSqlFileNode(String connectionId, String catalog, String fileName) {
        TreeNode node = new TreeNode();
        node.setId(SchemaNodeIds.workspaceSqlFileNodeId(connectionId, catalog, fileName));
        node.setLabel(fileName);
        node.setType("sql_file");
        node.setExpanded(false);
        node.setChildren(List.of());
        return node;
    }

    private void collectSqlScripts(
            String connectionId,
            Path instanceRoot,
            String instanceFilter,
            List<InstanceSqlFileDto> files
    ) throws IOException {
        if (instanceFilter != null) {
            Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceFilter);
            appendWorkspaceScripts(connectionId, instanceFilter, workspaceDir, files);
            return;
        }
        if (!Files.isDirectory(instanceRoot)) {
            return;
        }
        try (Stream<Path> instances = Files.list(instanceRoot)) {
            for (Path instancePath : instances.filter(Files::isDirectory).toList()) {
                String instanceName = instancePath.getFileName().toString();
                if (!instancePath.startsWith(workspaceSupport.baseDir()) || !Files.isDirectory(instancePath)) {
                    continue;
                }
                appendWorkspaceScripts(connectionId, instanceName, instancePath, files);
            }
        }
    }

    private void appendWorkspaceScripts(
            String connectionId,
            String instanceName,
            Path workspaceDir,
            List<InstanceSqlFileDto> files
    ) throws IOException {
        if (!Files.isDirectory(workspaceDir)) {
            return;
        }
        try (Stream<Path> stream = Files.list(workspaceDir)) {
            for (Path path : stream
                    .filter(candidate -> Files.isRegularFile(candidate)
                            && candidate.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".sql"))
                    .toList()) {
                String fileName = path.getFileName().toString();
                long modifiedAt = workspaceSupport.lastModifiedTime(path).toMillis();
                String relative = workspaceSupport.relativize(path.normalize());
                files.add(new InstanceSqlFileDto(
                        connectionId,
                        instanceName,
                        fileName,
                        relative,
                        modifiedAt,
                        workspaceSupport.readPreview(path)
                ));
            }
        }
    }
}

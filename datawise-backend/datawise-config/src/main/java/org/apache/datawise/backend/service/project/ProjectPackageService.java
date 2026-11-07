package org.apache.datawise.backend.service.project;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.domain.CreateProjectRequest;
import org.apache.datawise.backend.domain.ProjectDto;
import org.apache.datawise.backend.domain.ProjectIds;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

/**
 * 项目导入/导出包：meta + 无密钥连接摘要 + docs/scripts。
 */
@Service
public class ProjectPackageService {

    private final ProjectService projectService;
    private final ConnectionStore connectionStore;
    private final ConfigDirectoryService configDirectory;
    private final UserAccessPolicy userAccessPolicy;
    private final ObjectMapper objectMapper;

    public ProjectPackageService(
                                 ProjectService projectService,
                                 ConnectionStore connectionStore,
                                 ConfigDirectoryService configDirectory,
                                 UserAccessPolicy userAccessPolicy,
                                 ObjectMapper objectMapper) {
        this.projectService = projectService;
        this.connectionStore = connectionStore;
        this.configDirectory = configDirectory;
        this.userAccessPolicy = userAccessPolicy;
        this.objectMapper = objectMapper;
    }

    public byte[] exportProject(String projectId) {
        userAccessPolicy.requireRegisteredUser();
        ProjectDto project = projectService.getProject(projectId);
        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        String id = ProjectIds.normalizeOrDefault(projectId);

        Map<String, Object> projectMeta = new LinkedHashMap<>();
        projectMeta.put("name", project.name());
        projectMeta.put("colorKey", project.colorKey() != null ? project.colorKey() : "");
        projectMeta.put("description", project.description() != null ? project.description() : "");
        projectMeta.put("defaultEnv", project.defaultEnv() != null ? project.defaultEnv() : "");
        projectMeta.put("templateId", project.templateId() != null ? project.templateId() : "blank");

        List<Map<String, Object>> connections = new ArrayList<>();
        for (ConnectionEntity connection : connectionStore.findAllConnections()) {
            if (!id.equals(ProjectIds.normalizeOrDefault(connection.getProjectId()))) {
                continue;
            }
            Map<String, Object> stub = new LinkedHashMap<>();
            stub.put("name", connection.getName());
            stub.put("dbType", connection.getDbType());
            stub.put("env", connection.getEnv());
            stub.put("host", connection.getHost());
            stub.put("port", connection.getPort());
            stub.put("databaseName", connection.getDatabaseName());
            stub.put("note", "secrets omitted");
            connections.add(stub);
        }

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("format", "datawise-project-package");
        meta.put("version", 1);
        meta.put("project", projectMeta);
        meta.put("connections", connections);

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bos)) {
            zip.putNextEntry(new ZipEntry("project.json"));
            zip.write(objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(meta));
            zip.closeEntry();
            Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, id));
            addDirectoryToZip(zip, root.resolve("docs"), "docs/");
            addDirectoryToZip(zip, root.resolve("scripts"), "scripts/");
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to export project " + id, ex);
        }
        return bos.toByteArray();
    }

    @SuppressWarnings("unchecked")
    public ProjectDto importProject(byte[] zipBytes, String overrideName) {
        userAccessPolicy.requireRegisteredUser();
        if (zipBytes == null || zipBytes.length == 0) {
            throw new IllegalArgumentException("PROJECT_PACKAGE_REQUIRED");
        }

        Map<String, byte[]> files = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    continue;
                }
                String name = entry.getName().replace('\\', '/');
                if ("project.json".equals(name) || name.startsWith("docs/") || name.startsWith("scripts/")) {
                    files.put(name, zip.readAllBytes());
                }
            }
        } catch (IOException ex) {
            throw new IllegalArgumentException("PROJECT_PACKAGE_INVALID");
        }

        byte[] metaBytes = files.get("project.json");
        if (metaBytes == null) {
            throw new IllegalArgumentException("PROJECT_PACKAGE_META_MISSING");
        }
        Map<String, Object> meta;
        try {
            meta = objectMapper.readValue(metaBytes, Map.class);
        } catch (IOException ex) {
            throw new IllegalArgumentException("PROJECT_PACKAGE_META_INVALID");
        }

        Map<String, Object> projectMeta = meta.get("project") instanceof Map<?, ?> nested
                ? (Map<String, Object>) nested
                : Map.of();
        String name = overrideName != null && !overrideName.isBlank()
                ? overrideName.trim()
                : String.valueOf(projectMeta.getOrDefault("name", "Imported project"));
        ProjectDto created = projectService.createProject(new CreateProjectRequest(
                name,
                stringOrNull(projectMeta.get("colorKey")),
                stringOrNull(projectMeta.get("description")),
                stringOrNull(projectMeta.get("templateId")),
                stringOrNull(projectMeta.get("defaultEnv"))));

        String tenantId = TenantIds.normalizeOrDefault(UserContext.getTenantId());
        Path root = configDirectory.resolve(ConfigPaths.tenantProjectDir(tenantId, created.id()));
        try {
            for (Map.Entry<String, byte[]> file : files.entrySet()) {
                if ("project.json".equals(file.getKey())) {
                    continue;
                }
                Path target = root.resolve(file.getKey()).normalize();
                if (!target.startsWith(root)) {
                    continue;
                }
                Files.createDirectories(target.getParent());
                Files.write(target, file.getValue());
            }
            Object connections = meta.get("connections");
            if (connections != null) {
                Path note = root.resolve("docs").resolve("imported-connections.md");
                Files.createDirectories(note.getParent());
                Files.writeString(
                        note,
                        "# Imported connection stubs\n\n"
                                + objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(connections)
                                + "\n\nSecrets were omitted; recreate credentials manually.\n",
                        StandardCharsets.UTF_8);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to materialize imported project files", ex);
        }
        return created;
    }

    private static void addDirectoryToZip(ZipOutputStream zip, Path dir, String prefix) throws IOException {
        if (!Files.isDirectory(dir)) {
            return;
        }
        Files.walkFileTree(dir, new SimpleFileVisitor<>() {

            @Override
            public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                String relative = dir.relativize(file).toString().replace('\\', '/');
                zip.putNextEntry(new ZipEntry(prefix + relative));
                try (InputStream in = Files.newInputStream(file)) {
                    in.transferTo(zip);
                }
                zip.closeEntry();
                return FileVisitResult.CONTINUE;
            }
        });
    }

    private static String stringOrNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}

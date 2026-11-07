package org.apache.datawise.backend.service.viewmodel;

import org.apache.datawise.backend.common.support.PathSegmentSanitizer;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.domain.ViewModelFileDto;
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
public class ViewModelCatalogService {

    static final String META_PUBLISHED = "published";
    static final String META_DRAFT = "draft";

    private final ViewModelWorkspaceSupport workspaceSupport;

    public ViewModelCatalogService(ViewModelWorkspaceSupport workspaceSupport) {
        this.workspaceSupport = workspaceSupport;
    }

    public List<TreeNode> listViewModelNodes(String connectionId, String instanceName) throws IOException {
        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(connectionId, instanceName);
        if (!Files.isDirectory(viewModelsDir)) {
            return List.of();
        }

        Map<String, ViewModelEntry> entries = new LinkedHashMap<>();
        try (Stream<Path> stream = Files.list(viewModelsDir)) {
            stream.filter(Files::isRegularFile).forEach(path -> {
                String fileName = path.getFileName().toString();
                String lower = fileName.toLowerCase(Locale.ROOT);
                if (ViewModelFileService.isOfficialViewModelFile(fileName)) {
                    registerOfficial(entries, fileName);
                    return;
                }
                if (lower.endsWith(".view.sql" + ViewModelFileService.DRAFT_SUFFIX)) {
                    String officialFileName = fileName.substring(
                            0,
                            fileName.length() - ViewModelFileService.DRAFT_SUFFIX.length()
                    );
                    registerDraft(entries, officialFileName);
                }
            });
        }

        return entries.values().stream()
                .sorted(Comparator.comparing(entry -> entry.displayName.toLowerCase(Locale.ROOT)))
                .map(entry -> toViewModelNode(connectionId, instanceName, entry))
                .toList();
    }

    public List<ViewModelFileDto> listViewModels(String connectionId, String instanceName) throws IOException {
        if (connectionId == null || connectionId.isBlank()) {
            throw new IllegalArgumentException("connectionId is required");
        }
        if (instanceName == null || instanceName.isBlank()) {
            throw new IllegalArgumentException("instanceName is required");
        }

        Path viewModelsDir = workspaceSupport.resolveViewModelsDir(connectionId, instanceName.trim());
        List<ViewModelFileDto> files = new ArrayList<>();
        if (!Files.isDirectory(viewModelsDir)) {
            return files;
        }

        try (Stream<Path> stream = Files.list(viewModelsDir)) {
            stream.filter(path -> Files.isRegularFile(path)
                            && ViewModelFileService.isOfficialViewModelFile(path.getFileName().toString()))
                    .forEach(path -> appendViewModel(connectionId, instanceName.trim(), path, files));
        }
        files.sort(Comparator.comparingLong(ViewModelFileDto::modifiedAt).reversed());
        return files;
    }

    private static void registerOfficial(Map<String, ViewModelEntry> entries, String fileName) {
        String key = fileName.toLowerCase(Locale.ROOT);
        ViewModelEntry entry = entries.computeIfAbsent(
                key,
                ignored -> new ViewModelEntry(fileName, PathSegmentSanitizer.viewModelDisplayName(fileName))
        );
        entry.fileName = fileName;
        entry.hasOfficial = true;
    }

    private static void registerDraft(Map<String, ViewModelEntry> entries, String officialFileName) {
        String key = officialFileName.toLowerCase(Locale.ROOT);
        ViewModelEntry entry = entries.computeIfAbsent(
                key,
                ignored -> new ViewModelEntry(
                        officialFileName,
                        PathSegmentSanitizer.viewModelDisplayName(officialFileName)
                )
        );
        entry.fileName = officialFileName;
        entry.hasDraft = true;
    }

    private TreeNode toViewModelNode(String connectionId, String instanceName, ViewModelEntry entry) {
        TreeNode node = new TreeNode();
        node.setId(SchemaNodeIds.viewModelNodeId(connectionId, instanceName, entry.fileName));
        node.setLabel(entry.displayName);
        node.setType("view_model");
        node.setMeta(resolveStatusMeta(entry));
        node.setExpanded(false);
        node.setChildren(List.of());
        return node;
    }

    static String resolveStatusMeta(ViewModelEntry entry) {
        if (entry.hasDraft) {
            return META_DRAFT;
        }
        if (entry.hasOfficial) {
            return META_PUBLISHED;
        }
        return META_DRAFT;
    }

    private void appendViewModel(
            String connectionId,
            String instanceName,
            Path path,
            List<ViewModelFileDto> files
    ) {
        try {
            String fileName = path.getFileName().toString();
            String displayName = PathSegmentSanitizer.viewModelDisplayName(fileName);
            files.add(new ViewModelFileDto(
                    connectionId,
                    instanceName,
                    displayName,
                    fileName,
                    workspaceSupport.relativize(path),
                    workspaceSupport.lastModifiedTime(path).toMillis(),
                    workspaceSupport.readPreview(path)
            ));
        } catch (IOException ex) {
            // skip unreadable files
        }
    }

    static final class ViewModelEntry {
        String fileName;
        final String displayName;
        boolean hasOfficial;
        boolean hasDraft;

        ViewModelEntry(String fileName, String displayName) {
            this.fileName = fileName;
            this.displayName = displayName;
        }
    }
}

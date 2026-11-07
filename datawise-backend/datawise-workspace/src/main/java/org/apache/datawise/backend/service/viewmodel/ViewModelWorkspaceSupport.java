package org.apache.datawise.backend.service.viewmodel;

import org.apache.datawise.backend.service.instancesql.InstanceSqlWorkspaceSupport;
import org.springframework.stereotype.Service;

import java.nio.file.Path;

/** Resolves per-instance view model storage paths. */
@Service
public final class ViewModelWorkspaceSupport {

    static final String VIEW_MODELS_DIR = "view-models";
    static final String DEFAULT_FILE = "query.view.sql";

    private final InstanceSqlWorkspaceSupport workspaceSupport;

    public ViewModelWorkspaceSupport(InstanceSqlWorkspaceSupport workspaceSupport) {
        this.workspaceSupport = workspaceSupport;
    }

    public Path resolveViewModelsDir(String connectionId, String instanceKey) {
        Path workspaceDir = workspaceSupport.resolveWorkspaceDir(connectionId, instanceKey);
        Path viewModelsDir = workspaceDir.resolve(VIEW_MODELS_DIR).normalize();
        if (!viewModelsDir.startsWith(workspaceSupport.baseDir())) {
            throw new IllegalArgumentException("Invalid view model path");
        }
        return viewModelsDir;
    }

    public String relativize(Path path) {
        return workspaceSupport.relativize(path);
    }

    public java.nio.file.attribute.FileTime lastModifiedTime(Path path) {
        return workspaceSupport.lastModifiedTime(path);
    }

    public String readPreview(Path path) throws java.io.IOException {
        return workspaceSupport.readPreview(path);
    }
}

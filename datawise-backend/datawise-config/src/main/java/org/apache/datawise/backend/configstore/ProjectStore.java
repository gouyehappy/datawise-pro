package org.apache.datawise.backend.configstore;

import org.apache.datawise.backend.model.ActiveProjectDocument;
import org.apache.datawise.backend.model.ProjectEntity;
import org.apache.datawise.backend.model.ProjectIndexDocument;

import java.util.List;
import java.util.Optional;

/** 租户级项目索引 + 用户活动项目（file / jdbc 可切换）。 */
public interface ProjectStore {

    ProjectIndexDocument loadIndex(String tenantId);

    void saveIndex(String tenantId, ProjectIndexDocument index);

    List<ProjectEntity> listProjects(String tenantId);

    Optional<ProjectEntity> findProject(String tenantId, String projectId);

    ProjectEntity upsertProject(String tenantId, ProjectEntity project);

    void deleteProject(String tenantId, String projectId);

    ActiveProjectDocument loadActiveProject(long userId, String tenantId);

    void saveActiveProject(long userId, String tenantId, ActiveProjectDocument document);

    /** 确保默认项目与目录存在，返回 defaultProjectId。 */
    String ensureDefaultProject(String tenantId);
}

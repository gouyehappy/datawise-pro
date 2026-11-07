package org.apache.datawise.backend.model;

import java.util.ArrayList;
import java.util.List;

/** 租户项目索引文件根对象。 */
public class ProjectIndexDocument {

    private int version = 1;
    private List<ProjectEntity> projects = new ArrayList<>();
    private String defaultProjectId;

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public List<ProjectEntity> getProjects() {
        return projects;
    }

    public void setProjects(List<ProjectEntity> projects) {
        this.projects = projects != null ? projects : new ArrayList<>();
    }

    public String getDefaultProjectId() {
        return defaultProjectId;
    }

    public void setDefaultProjectId(String defaultProjectId) {
        this.defaultProjectId = defaultProjectId;
    }
}

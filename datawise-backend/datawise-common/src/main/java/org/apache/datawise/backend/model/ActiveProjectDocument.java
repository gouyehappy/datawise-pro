package org.apache.datawise.backend.model;

/** 用户 × 租户活动项目。 */
public class ActiveProjectDocument {

    private String projectId;

    public ActiveProjectDocument() {
    }

    public ActiveProjectDocument(String projectId) {
        this.projectId = projectId;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }
}

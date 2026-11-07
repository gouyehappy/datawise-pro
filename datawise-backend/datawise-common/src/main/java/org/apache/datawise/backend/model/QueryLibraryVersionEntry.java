package org.apache.datawise.backend.model;

import java.time.Instant;

/**
 * 团队共享 SQL 版本快照。
 */
public class QueryLibraryVersionEntry {

    private String id;
    private String teamId;
    private String queryId;
    private int version;
    private String title;
    private String sql;
    private String changeNote;
    private Instant savedAt;
    private Long savedByUserId;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getTeamId() {
        return teamId;
    }

    public void setTeamId(String teamId) {
        this.teamId = teamId;
    }

    public String getQueryId() {
        return queryId;
    }

    public void setQueryId(String queryId) {
        this.queryId = queryId;
    }

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getSql() {
        return sql;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

    public String getChangeNote() {
        return changeNote;
    }

    public void setChangeNote(String changeNote) {
        this.changeNote = changeNote;
    }

    public Instant getSavedAt() {
        return savedAt;
    }

    public void setSavedAt(Instant savedAt) {
        this.savedAt = savedAt;
    }

    public Long getSavedByUserId() {
        return savedByUserId;
    }

    public void setSavedByUserId(Long savedByUserId) {
        this.savedByUserId = savedByUserId;
    }
}

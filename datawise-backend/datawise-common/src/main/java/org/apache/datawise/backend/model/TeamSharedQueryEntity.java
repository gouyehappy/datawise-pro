package org.apache.datawise.backend.model;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public class TeamSharedQueryEntity {

    private String id;
    private String teamId;
    private String title;
    private String description;
    private String connectionId;
    private String connectionName;
    private String database;
    private String sql;
    private List<String> tags = new ArrayList<>();
    private List<Long> favoriteUserIds = new ArrayList<>();
    private List<TeamSharedQueryCommentEntity> comments = new ArrayList<>();
    private Long sharedByUserId;
    private Instant sharedAt;
    private Instant updatedAt;

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

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getConnectionId() {
        return connectionId;
    }

    public void setConnectionId(String connectionId) {
        this.connectionId = connectionId;
    }

    public String getConnectionName() {
        return connectionName;
    }

    public void setConnectionName(String connectionName) {
        this.connectionName = connectionName;
    }

    public String getDatabase() {
        return database;
    }

    public void setDatabase(String database) {
        this.database = database;
    }

    public String getSql() {
        return sql;
    }

    public void setSql(String sql) {
        this.sql = sql;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags != null ? new ArrayList<>(tags) : new ArrayList<>();
    }

    public List<Long> getFavoriteUserIds() {
        return favoriteUserIds;
    }

    public void setFavoriteUserIds(List<Long> favoriteUserIds) {
        this.favoriteUserIds = favoriteUserIds != null ? new ArrayList<>(favoriteUserIds) : new ArrayList<>();
    }

    public List<TeamSharedQueryCommentEntity> getComments() {
        return comments;
    }

    public void setComments(List<TeamSharedQueryCommentEntity> comments) {
        this.comments = comments != null ? new ArrayList<>(comments) : new ArrayList<>();
    }

    public Long getSharedByUserId() {
        return sharedByUserId;
    }

    public void setSharedByUserId(Long sharedByUserId) {
        this.sharedByUserId = sharedByUserId;
    }

    public Instant getSharedAt() {
        return sharedAt;
    }

    public void setSharedAt(Instant sharedAt) {
        this.sharedAt = sharedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}

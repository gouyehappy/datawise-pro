package org.apache.datawise.backend.domain;

public record AddTeamSharedQueryCommentRequest(String content) {

    public AddTeamSharedQueryCommentRequest {
        if (content != null) {
            content = content.trim();
        }
    }
}

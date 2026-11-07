package org.apache.datawise.backend.domain;

public record TeamSharedQueryCommentDto(
        String id,
        Long userId,
        String userName,
        String content,
        String createdAt) {
}

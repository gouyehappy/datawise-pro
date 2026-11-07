package org.apache.datawise.backend.domain;

public record ChangePasswordRequest(String currentPassword, String newPassword) {
}

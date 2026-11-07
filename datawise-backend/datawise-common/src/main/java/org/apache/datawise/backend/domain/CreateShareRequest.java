package org.apache.datawise.backend.domain;

/** Create a frozen share snapshot. */
public record CreateShareRequest(
        String title,
        String kind,
        String payloadJson,
        Integer expiresInDays) {
}

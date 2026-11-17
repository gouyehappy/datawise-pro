package org.apache.datawise.backend.domain;

/** Local username/password login body (never send credentials as query params). */
public record LoginRequest(String userName, String userPassword) {
}

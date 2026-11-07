package org.apache.datawise.backend.domain.pack;

/** Install a signed {@code .dpk} from a local absolute/relative path. */
public record InstallDpkRequest(String path) {
}

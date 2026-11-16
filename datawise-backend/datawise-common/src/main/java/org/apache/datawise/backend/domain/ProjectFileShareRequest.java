package org.apache.datawise.backend.domain;

/** 共享 / 取消共享私有目录下的某个目录。 */
public record ProjectFileShareRequest(String root, String path) {
}

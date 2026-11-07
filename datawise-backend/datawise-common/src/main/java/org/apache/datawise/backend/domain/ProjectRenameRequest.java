package org.apache.datawise.backend.domain;

/** 重命名项目 docs/scripts 下的文件或目录。 */
public record ProjectRenameRequest(
        String root,
        String fromPath,
        String toPath) {
}

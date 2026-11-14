package org.apache.datawise.backend.domain;

/** 删除项目 docs/scripts 下的文件或目录。 */
public record ProjectDeleteRequest(
        String root,
        String path) {
}

package org.apache.datawise.backend.domain;

/** 在项目 docs/scripts 下创建文件夹。 */
public record ProjectMkdirRequest(
        String root,
        String path) {
}

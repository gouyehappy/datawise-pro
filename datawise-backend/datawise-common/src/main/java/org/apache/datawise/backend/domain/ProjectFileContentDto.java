package org.apache.datawise.backend.domain;

/** 读写项目文件请求/响应。 */
public record ProjectFileContentDto(
        String root,
        String path,
        String content) {
}

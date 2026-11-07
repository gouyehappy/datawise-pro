package org.apache.datawise.backend.domain;

/** 项目 docs/scripts 下的文件或文件夹条目。 */
public record ProjectFileEntryDto(
        String name,
        String path,
        boolean directory,
        Long sizeBytes,
        String updatedAt) {
}

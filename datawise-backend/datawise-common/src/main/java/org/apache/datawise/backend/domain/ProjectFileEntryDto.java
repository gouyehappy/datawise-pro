package org.apache.datawise.backend.domain;

/**
 * 项目 docs/scripts 下的文件或文件夹条目。
 *
 * @param shared   该目录已被共享给项目内其它账号，或该条目本身是别人共享出来的引用
 * @param sharedBy 共享来源账号名（仅引用节点有值）
 */
public record ProjectFileEntryDto(
        String name,
        String path,
        boolean directory,
        Long sizeBytes,
        String updatedAt,
        boolean shared,
        String sharedBy) {

    public ProjectFileEntryDto(
                               String name,
                               String path,
                               boolean directory,
                               Long sizeBytes,
                               String updatedAt) {
        this(name, path, directory, sizeBytes, updatedAt, false, null);
    }
}

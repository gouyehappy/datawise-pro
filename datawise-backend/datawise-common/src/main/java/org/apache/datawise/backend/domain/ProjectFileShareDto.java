package org.apache.datawise.backend.domain;

/**
 * 一条「把私有目录共享给项目内其它账号」的记录。
 * <p>
 * 共享的是创建者私有区里的某个目录（{@code users/u{ownerUserId}/{root}/{path}}），
 * 不是独立的共享目录：其它账号在对应 root 下看到的是一个只读/可协作的引用节点。
 *
 * @param ownerUserId    目录归属账号
 * @param ownerUsername  归属账号名（展示用）
 * @param root           docs 或 scripts
 * @param path           归属账号私有区内的目录相对路径
 * @param sharedAt       ISO 时间
 */
public record ProjectFileShareDto(
        long ownerUserId,
        String ownerUsername,
        String root,
        String path,
        String sharedAt) {
}

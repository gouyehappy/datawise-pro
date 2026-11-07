/** 超大 schema 下表补全条数上限（FK 相关表优先，其余按前缀匹配） */
export const MAX_TABLE_SUGGESTIONS = 200

/** 超过此表数量时跳过全量排序，仅收集相关表 + 前缀匹配 */
export const LARGE_SCHEMA_TABLE_THRESHOLD = 500

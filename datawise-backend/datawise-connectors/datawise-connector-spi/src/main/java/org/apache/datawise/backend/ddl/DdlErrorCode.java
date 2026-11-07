package org.apache.datawise.backend.ddl;

/** DDL 翻译 / 渲染错误码，供 API 与前端识别。 */
public enum DdlErrorCode {
    RENDERER_NOT_FOUND,
    MAPPER_NOT_FOUND,
    SOURCE_TABLE_MISSING,
    INVALID_DEFINITION
}

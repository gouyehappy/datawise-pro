/**
 * API 客户端工厂
 *
 * 所有远程能力统一经 @/api 暴露；shared/api 为 HTTP 传输层，业务代码勿直接引用。
 *
 * 基址优先级见 {@link readApiBaseUrl}：设置云端地址 → VITE_API_BASE_URL / 桌面桥 → 本地默认。
 */
import {createHttpApiClient} from '@/shared/api/http'
import type {ApiClient} from '@/shared/api/types'

/** 创建 HTTP API 客户端（对接 Spring Boot 后端） */
export function createApiClient(): ApiClient {
    return createHttpApiClient()
}

export {readApiBaseUrl} from '@/shared/api/mode'

import {postJson} from '@/shared/api/http/request'
import {API_PATHS} from '@/shared/api/http/paths'
import type {HttpRequestOptions} from '@/shared/api/http/request'
import type {SqlReviewRequest, SqlReviewResult} from '@/features/platform/types/platform.types'

export type {SqlReviewRequest, SqlReviewResult, SqlReviewFinding} from '@/features/platform/types/platform.types'

export async function reviewSql(
    request: SqlReviewRequest,
    options?: HttpRequestOptions,
): Promise<SqlReviewResult> {
    return postJson<SqlReviewResult>(API_PATHS.platform.sqlReview, request, options)
}

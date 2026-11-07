/** Explorer ops DTOs shared by HTTP client and feature services (no features→shared cycle). */

export interface KafkaTopicsResult {
    topics: string[]
    totalCount: number
}

export interface YarnMutationResult {
    success: boolean
    message: string | null
    state: string | null
}

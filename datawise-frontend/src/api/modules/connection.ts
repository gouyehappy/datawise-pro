import {api} from '@/shared/api'
import type {ConnectionConfig} from '@/core/types'

export const connectionApi = {
    test: (config: ConnectionConfig) => api.connection.test(config),
}

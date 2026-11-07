import {aiApi} from '@/api'

export type {AiPythonRuntime} from '@/shared/api/types'

export async function fetchAiPythonRuntime() {
    return aiApi.fetchPythonRuntime()
}

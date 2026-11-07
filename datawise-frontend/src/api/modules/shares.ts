import {API_PATHS} from '@/shared/api/http/paths'
import {deleteJson, getJson, postJson} from '@/shared/api/http/request'
import {readApiBaseUrl} from '@/shared/api/mode'
import type {CreateShareResult, ShareSnapshot} from '@/shared/api/types'

export const sharesApi = {
    listMine: () => getJson<ShareSnapshot[]>(API_PATHS.shares.list),
    create: (body: {
        title: string
        kind?: string
        payloadJson: string
        expiresInDays?: number
    }) => postJson<CreateShareResult>(API_PATHS.shares.create, body),
    revoke: (id: string) => deleteJson<void>(API_PATHS.shares.revoke(id)),
    publicPageUrl: (token: string) => {
        const base = readApiBaseUrl().replace(/\/$/, '')
        const path = API_PATHS.shares.publicPage(token)
        return base ? `${base}${path}` : path
    },
}

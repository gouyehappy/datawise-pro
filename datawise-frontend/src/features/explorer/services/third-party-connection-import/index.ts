import {detectThirdPartyConnectionSource} from './detect'
import {parseDataGripDataSourcesXml} from './parse-datagrip'
import {parseDbeaverDataSourcesJson} from './parse-dbeaver'
import {parseNavicatNcx} from './parse-navicat'
import type {ThirdPartyImportParseResult, ThirdPartyImportSource} from './types'

export type {ThirdPartyConnectionDraft, ThirdPartyImportParseResult, ThirdPartyImportSource} from './types'
export {detectThirdPartyConnectionSource, THIRD_PARTY_IMPORT_ACCEPT} from './detect'
export {draftsToConnectionConfigs, draftToConnectionConfig} from './map-to-connection'

export function parseThirdPartyConnectionFile(
    text: string,
    fileName = '',
    sourceHint?: ThirdPartyImportSource | null,
): ThirdPartyImportParseResult | null {
    const source = sourceHint ?? detectThirdPartyConnectionSource(text, fileName)
    if (!source) return null
    switch (source) {
        case 'datagrip':
            return parseDataGripDataSourcesXml(text)
        case 'dbeaver':
            return parseDbeaverDataSourcesJson(text)
        case 'navicat':
            return parseNavicatNcx(text)
        default:
            return null
    }
}

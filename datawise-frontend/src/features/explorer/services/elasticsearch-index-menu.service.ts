import type {ComposerTranslation} from 'vue-i18n'
import type {ContextMenuItem} from '@/core/types'

/** Context menu for Elasticsearch index (table) nodes. */
export function buildElasticsearchIndexMenuItems(t: ComposerTranslation): ContextMenuItem[] {
    const c = (key: string) => t(`explorer.context.${key}`)
    return [
        {id: 'open', label: c('openEsWorkbench'), icon: 'open', shortcut: 'F4'},
        {id: 'es-mapping', label: c('esMapping'), icon: 'ddl'},
        {id: 'es-settings', label: c('esSettings'), icon: 'edit'},
        {id: 'es-stats', label: c('esStats'), icon: 'table'},
        {id: 'copy-name', label: c('copyName'), icon: 'copy'},
        {id: 'divider-1', label: '', divider: true},
        {id: 'es-clear', label: c('esClearIndex'), icon: 'truncate', danger: true},
    ]
}

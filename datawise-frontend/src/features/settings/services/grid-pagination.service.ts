import {useEditorSettingsStore} from '@/features/settings/stores/editor-settings'
import {
    isGridPageSizeValue,
    minGridPageSizeOption,
    resolveGridPageSizeOption as resolveGridPageSizeOptionPure,
} from '@/shared/config/grid-pagination'
import {GRID_PAGE_SIZE_OPTIONS} from '@/shared/config/editor-presets'

export {isGridPageSizeValue, minGridPageSizeOption}

/** 读取设置中的默认分页；未配置或不在候选列表时回退为最小值 */
export function resolveGridPageSizeOption(
    options: readonly string[] = GRID_PAGE_SIZE_OPTIONS.map(String),
): string {
    const configured = useEditorSettingsStore().settings.defaultGridPageSize
    return resolveGridPageSizeOptionPure(options, configured)
}

/**
 * UI 壳层款式 id（由 skin-registry 注册）
 * capabilities 描述壳层行为，避免 theme.service / 组件散落 isIde。
 */
export type UiSkin = 'classic' | 'ide' | 'atelier' | 'ledger'

/** 壳层能力：差异只声明在此，CSS 用 data-ui-skin，JS 读 capabilities */
export interface UiSkinCapabilities {
    /** 面板阴影：inherit=跟明暗主题；none=扁平 */
    panelShadow: 'inherit' | 'none'
    /** 壳层是否零 padding / 零 panel-gap（IDE 贴边） */
    shellFlush: boolean
    /** Activity Bar 是否展示短文案（classic=true） */
    activityBarLabels: boolean
    /** Tab：pill=胶囊描边；strip=贴齐编辑器条 */
    tabStyle: 'pill' | 'strip'
}

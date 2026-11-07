/** 系统图标尺寸令牌（对应 variables.css 中的 --dw-icon-size-*） */
export type DwIconSizeToken =
    | 'xs'
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | 'rail'
    | 'console'
    | 'tab'
    | 'menu'

export type DwIconSize = number | DwIconSizeToken

export const DW_ICON_SIZE_DEFAULT: DwIconSizeToken = 'md'

export function isDwIconSizeToken(size: DwIconSize | undefined): size is DwIconSizeToken {
    return typeof size === 'string'
}

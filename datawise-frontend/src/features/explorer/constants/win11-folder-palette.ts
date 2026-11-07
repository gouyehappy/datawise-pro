/** Windows 11 Fluent 文件夹渐变配色 */
export interface Win11FolderPalette {
    tab: readonly [string, string]
    body: readonly [string, string, string]
    openBack: readonly [string, string]
    openFront: readonly [string, string, string]
    shadow: string
    inner: string
    innerStroke: string
}

/** 普通文件夹（黄色） */
export const WIN11_FOLDER_YELLOW: Win11FolderPalette = {
    tab: ['#FFF4CE', '#FFCD42'],
    body: ['#FFD54F', '#FFB900', '#E5A000'],
    openBack: ['#D89600', '#B87400'],
    openFront: ['#FFE082', '#FFB900', '#E5A000'],
    shadow: 'rgb(184 116 0 / 22%)',
    inner: '#FFF9E6',
    innerStroke: 'rgb(216 150 0 / 28%)',
}

/** 特殊文件夹（蓝色，如 Win11 文档/桌面） */
export const WIN11_FOLDER_BLUE: Win11FolderPalette = {
    tab: ['#EAF6FF', '#7EC8FF'],
    body: ['#5CC8FF', '#0078D4', '#005A9E'],
    openBack: ['#005A9E', '#003E6B'],
    openFront: ['#8FD0FF', '#0078D4', '#005A9E'],
    shadow: 'rgb(0 90 158 / 24%)',
    inner: '#EBF6FF',
    innerStroke: 'rgb(0 120 212 / 30%)',
}

export function resolveWin11FolderPalette(special: boolean): Win11FolderPalette {
    return special ? WIN11_FOLDER_BLUE : WIN11_FOLDER_YELLOW
}

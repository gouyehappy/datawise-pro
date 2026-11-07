export type LocalGitLineKind = 'added' | 'modified' | 'deleted'

export type LocalGitLineMark = {
    kind: LocalGitLineKind
    /** 1-based inclusive */
    startLine: number
    /** 1-based inclusive */
    endLine: number
}

/** Package-local git gutter mark types (no host path coupling). */

export type GitLineKind = 'added' | 'modified' | 'deleted'

export type GitLineMark = {
  kind: GitLineKind
  /** 1-based inclusive */
  startLine: number
  /** 1-based inclusive */
  endLine: number
}

/** @deprecated Prefer `GitLineMark` — alias kept for host-shaped importers. */
export type LocalGitLineMark = GitLineMark
/** @deprecated Prefer `GitLineKind`. */
export type LocalGitLineKind = GitLineKind

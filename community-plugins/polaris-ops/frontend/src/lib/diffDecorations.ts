import {
  computeLineDiff,
  type DiffLineKind,
  type DiffLineMark,
} from './lineDiff'

type DecRange = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

type DecOpts = {
  isWholeLine?: boolean
  className?: string
  linesDecorationsClassName?: string
  overviewRuler?: { color: string; position: number }
  minimap?: { color: string; position: number }
}

type Dec = { range: DecRange; options: DecOpts }

type TextEditor = {
  deltaDecorations: (oldIds: string[], decorations: Dec[]) => string[]
  revealLineInCenter: (line: number) => void
  updateOptions: (options: Record<string, unknown>) => void
}

type DiffEditorLike = {
  getOriginalEditor: () => TextEditor
  getModifiedEditor: () => TextEditor
}

const OverviewRulerLaneCenter = 2
const MinimapPositionInline = 1

function markClass(kind: DiffLineKind): { line: string; bar: string; color: string } {
  if (kind === 'added') {
    return { line: 'hist-diff-line--add', bar: 'hist-diff-bar--add', color: '#3ecf8e' }
  }
  if (kind === 'removed') {
    return { line: 'hist-diff-line--del', bar: 'hist-diff-bar--del', color: '#f0716c' }
  }
  return { line: 'hist-diff-line--chg', bar: 'hist-diff-bar--chg', color: '#e6b84d' }
}

function toDecorations(marks: DiffLineMark[]): Dec[] {
  return marks.map((m) => {
    const cls = markClass(m.kind)
    return {
      range: {
        startLineNumber: m.lineNumber,
        startColumn: 1,
        endLineNumber: m.lineNumber,
        endColumn: 1,
      },
      options: {
        isWholeLine: true,
        className: cls.line,
        linesDecorationsClassName: cls.bar,
        overviewRuler: { color: cls.color, position: OverviewRulerLaneCenter },
        minimap: { color: cls.color, position: MinimapPositionInline },
      },
    }
  })
}

export type DiffDecorationHandles = {
  apply: (original: string, modified: string) => number[]
  clear: () => void
}

/** Apply git-like gutter bars + line washes onto a Monaco DiffEditor. */
export function bindDiffDecorations(editor: DiffEditorLike): DiffDecorationHandles {
  const orig = editor.getOriginalEditor()
  const mod = editor.getModifiedEditor()
  orig.updateOptions({ glyphMargin: true, lineDecorationsWidth: 10, lineNumbersMinChars: 3 })
  mod.updateOptions({ glyphMargin: true, lineDecorationsWidth: 10, lineNumbersMinChars: 3 })

  let origIds: string[] = []
  let modIds: string[] = []

  return {
    apply(original, modified) {
      const diff = computeLineDiff(original, modified)
      origIds = orig.deltaDecorations(origIds, toDecorations(diff.originalMarks))
      modIds = mod.deltaDecorations(modIds, toDecorations(diff.modifiedMarks))
      return diff.hunkStarts
    },
    clear() {
      origIds = orig.deltaDecorations(origIds, [])
      modIds = mod.deltaDecorations(modIds, [])
    },
  }
}

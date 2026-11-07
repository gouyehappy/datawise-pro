import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import { DEFAULT_EDITOR_FONT_SIZE } from '../lib/editorPrefs'
import type { LocaleDict } from '../lib/i18n'
import { bindDiffDecorations } from '../lib/diffDecorations'
import {
  computeLineDiffStats,
  contentsEqual,
  firstDiffLine,
} from '../lib/lineDiff'
import { configureMonaco, monacoLanguage } from '../lib/monaco'
import {
  historyRowKey,
  historyRowTime,
  type ConfigHistoryRow,
} from '../lib/types'

type Props = {
  loading: boolean
  rows: ConfigHistoryRow[]
  selected: ConfigHistoryRow | null
  currentContent: string
  currentFormat: string
  /** Published config md5 — used for list badges when row content is not loaded yet. */
  currentMd5?: string
  readOnly: boolean
  saving?: boolean
  t: (key: keyof LocaleDict, vars?: Record<string, string | number>) => string
  onClose: () => void
  onSelect: (row: ConfigHistoryRow) => void
  onRestore: (row: ConfigHistoryRow) => void
}

type DiffApi = {
  goNext: () => void
  goPrev: () => void
}

const DiffLazy = lazy(async () => {
  const mod = await configureMonaco()
  return {
    default: function DiffInner(props: {
      original: string
      modified: string
      language: string
      theme: string
      fontSize: number
      apiRef: MutableRefObject<DiffApi | null>
    }) {
      const DiffEditor = mod.DiffEditor
      const hostRef = useRef<HTMLDivElement>(null)
      const decoRef = useRef<ReturnType<typeof bindDiffDecorations> | null>(null)
      const hunksRef = useRef<number[]>([])
      const hunkIdxRef = useRef(0)

      useEffect(() => {
        if (!decoRef.current) return
        hunksRef.current = decoRef.current.apply(props.original, props.modified)
        hunkIdxRef.current = 0
      }, [props.original, props.modified])

      return (
        <div className="hist-panel__diff-host" ref={hostRef}>
          <DiffEditor
            height="100%"
            width="100%"
            language={props.language}
            theme={props.theme}
            original={props.original}
            modified={props.modified}
            options={{
              readOnly: true,
              renderSideBySide: true,
              useInlineViewWhenSpaceIsLimited: false,
              enableSplitViewResizing: true,
              renderOverviewRuler: true,
              renderMarginRevertIcon: false,
              glyphMargin: true,
              lineDecorationsWidth: 10,
              minimap: { enabled: false },
              automaticLayout: true,
              fontSize: props.fontSize,
              lineHeight: Math.round(props.fontSize * 1.55),
              fontFamily: 'var(--mono)',
              scrollBeyondLastLine: false,
              renderIndicators: true,
              ignoreTrimWhitespace: false,
              originalEditable: false,
              stickyScroll: { enabled: false },
              padding: { top: 8, bottom: 8 },
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
            onMount={(editor) => {
              decoRef.current = bindDiffDecorations(editor)
              hunksRef.current = decoRef.current.apply(props.original, props.modified)
              hunkIdxRef.current = 0

              const layout = () => {
                try {
                  editor.layout()
                } catch {
                  /* disposed */
                }
              }
              const revealHunk = (line: number) => {
                try {
                  editor.getOriginalEditor().revealLineInCenter(line)
                  editor.getModifiedEditor().revealLineInCenter(line)
                } catch {
                  /* */
                }
              }
              const go = (dir: 'next' | 'previous') => {
                const hunks = hunksRef.current
                if (!hunks.length) {
                  revealHunk(firstDiffLine(props.original, props.modified))
                  return
                }
                if (dir === 'next') {
                  hunkIdxRef.current = (hunkIdxRef.current + 1) % hunks.length
                } else {
                  hunkIdxRef.current = (hunkIdxRef.current - 1 + hunks.length) % hunks.length
                }
                revealHunk(hunks[hunkIdxRef.current]!)
              }
              requestAnimationFrame(layout)
              const timers = [50, 150, 400].map((ms) =>
                window.setTimeout(() => {
                  layout()
                  if (decoRef.current) {
                    hunksRef.current = decoRef.current.apply(props.original, props.modified)
                  }
                }, ms),
              )
              props.apiRef.current = {
                goNext: () => go('next'),
                goPrev: () => go('previous'),
              }
              const host = hostRef.current
              let ro: ResizeObserver | undefined
              if (host && typeof ResizeObserver !== 'undefined') {
                ro = new ResizeObserver(() => layout())
                ro.observe(host)
              }
              editor.onDidDispose(() => {
                timers.forEach((id) => window.clearTimeout(id))
                ro?.disconnect()
                decoRef.current?.clear()
                decoRef.current = null
                props.apiRef.current = null
              })
            }}
          />
        </div>
      )
    },
  }
})

function formatCompactTime(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Prefer release version stamp; hide legacy datawise-* markers. */
function rowNote(row: ConfigHistoryRow) {
  const file = String(row.fileName || '').trim()
  const candidates = [row.name, row.comment, row.releaseDescription]
  for (const raw of candidates) {
    const s = String(raw || '').trim()
    if (!s) continue
    if (/^datawise-polaris-ops$/i.test(s)) continue
    if (file && s === file) continue
    const legacy = /^datawise-(\d{9,13})$/i.exec(s)
    if (legacy) {
      const n = Number(legacy[1])
      const ms = n > 1e12 ? n : n * 1000
      const d = new Date(ms)
      if (!Number.isNaN(d.getTime())) return formatCompactTime(d)
      continue
    }
    return s
  }
  return ''
}

function rowWho(row: ConfigHistoryRow) {
  return row.modifyBy || row.createBy || ''
}

function rowDiffKind(
  row: ConfigHistoryRow,
  current: string,
  currentMd5?: string,
): 'same' | 'diff' | 'unknown' {
  if (row.content != null && row.content !== '') {
    return contentsEqual(row.content, current) ? 'same' : 'diff'
  }
  if (row.md5 && currentMd5) {
    return row.md5 === currentMd5 ? 'same' : 'diff'
  }
  return 'unknown'
}

export function HistoryDiffPanel({
  loading,
  rows,
  selected,
  currentContent,
  currentFormat,
  currentMd5,
  readOnly,
  saving,
  t,
  onClose,
  onSelect,
  onRestore,
}: Props) {
  const [theme, setTheme] = useState('vs-dark')
  const apiRef = useRef<DiffApi | null>(null)
  const fontSize = DEFAULT_EDITOR_FONT_SIZE

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const sync = () => {
      const appearance =
        document.documentElement.getAttribute('data-theme') ||
        document.documentElement.getAttribute('data-dw-theme') ||
        'dark'
      setTheme(appearance === 'light' ? 'vs' : 'vs-dark')
    }
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-dw-theme'],
    })
    return () => obs.disconnect()
  }, [])

  const lang = useMemo(
    () => monacoLanguage(selected?.format || currentFormat),
    [selected?.format, currentFormat],
  )

  const sameAsCurrent = useMemo(() => {
    if (!selected) return false
    return contentsEqual(selected.content ?? '', currentContent ?? '')
  }, [selected, currentContent])

  const stats = useMemo(
    () => computeLineDiffStats(currentContent, selected?.content ?? ''),
    [currentContent, selected],
  )

  const hasDiff = Boolean(selected) && !sameAsCurrent && (stats.added > 0 || stats.removed > 0 || stats.changes > 0)
  const selectedKey = selected ? historyRowKey(selected) : 'none'

  return (
    <div className="hist-panel">
      <div className="hist-panel__toolbar">
        <div className="hist-panel__toolbar-main">
          <strong>{t('historyTitle')}</strong>
          <span className="hist-panel__toolbar-hint">{t('historyDiffHint')}</span>
        </div>
        <div className="hist-panel__toolbar-actions">
          {selected && !sameAsCurrent ? (
            <div className="hist-panel__stats" aria-live="polite">
              <span className="hist-panel__stat hist-panel__stat--chg">
                {t('historyChanges', { count: stats.changes })}
              </span>
              <span className="hist-panel__stat hist-panel__stat--add">+{stats.added}</span>
              <span className="hist-panel__stat hist-panel__stat--del">−{stats.removed}</span>
              <button
                type="button"
                className="btn btn--soft"
                disabled={!hasDiff}
                onClick={() => apiRef.current?.goPrev()}
                title={t('historyPrevChange')}
              >
                {t('historyPrevChange')}
              </button>
              <button
                type="button"
                className="btn btn--soft"
                disabled={!hasDiff}
                onClick={() => apiRef.current?.goNext()}
                title={t('historyNextChange')}
              >
                {t('historyNextChange')}
              </button>
            </div>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="btn btn--accent"
              disabled={!selected || saving || !(selected.content ?? '') || sameAsCurrent}
              onClick={() => selected && onRestore(selected)}
            >
              {t('restoreHistory')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            {t('historyExit')}
          </button>
        </div>
      </div>

      <div className="hist-panel__body">
        <aside className="hist-panel__list-pane">
          <div className="hist-panel__list-head">{t('historyListTitle')}</div>
          {loading ? (
            <div className="hist-panel__empty">{t('loading')}</div>
          ) : rows.length === 0 ? (
            <div className="hist-panel__empty">{t('historyEmpty')}</div>
          ) : (
            <ul className="hist-panel__list">
              {rows.map((row, i) => {
                const key = historyRowKey(row, i)
                const active = selected
                  ? historyRowKey(selected, i) === key || historyRowKey(selected) === key
                  : false
                const time = historyRowTime(row)
                const who = rowWho(row)
                const note = rowNote(row)
                const kind = rowDiffKind(row, currentContent, currentMd5)
                return (
                  <li key={key} className="hist-panel__li">
                    <button
                      type="button"
                      className={`hist-panel__row ${active ? 'is-active' : ''} ${
                        kind === 'diff' ? 'has-diff' : kind === 'same' ? 'is-same' : ''
                      }`}
                      onClick={() => onSelect(row)}
                    >
                      <span className="hist-panel__rail" aria-hidden="true" />
                      <span className="hist-panel__dot" aria-hidden="true" />
                      <div className="hist-panel__row-body">
                        <div className="hist-panel__row-top">
                          <span className="hist-panel__idx">
                            #{i + 1}
                            {i === 0 ? (
                              <span className="hist-panel__badge hist-panel__badge--latest">
                                {t('historyLatest')}
                              </span>
                            ) : null}
                          </span>
                          {active ? (
                            <span className="hist-panel__badge hist-panel__badge--cmp">
                              {t('historyComparing')}
                            </span>
                          ) : kind === 'diff' ? (
                            <span className="hist-panel__badge hist-panel__badge--diff">
                              {t('historyDifferent')}
                            </span>
                          ) : kind === 'same' ? (
                            <span className="hist-panel__badge">{t('historySame')}</span>
                          ) : null}
                        </div>
                        <div className="hist-panel__row-time">{time || '—'}</div>
                        <div className="hist-panel__row-sub">
                          {who ? <span>{who}</span> : null}
                          {row.type ? <span className="chip">{row.type}</span> : null}
                          {row.md5 ? (
                            <span className="mono" title={row.md5}>
                              {row.md5.slice(0, 8)}
                            </span>
                          ) : null}
                        </div>
                        {note ? (
                          <div className="hist-panel__row-note" title={note}>
                            {note}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <section className="hist-panel__diff-pane">
          <div className="hist-panel__diff-labels">
            <span className="hist-panel__label hist-panel__label--cur">
              <i />
              {t('historyCurrent')}
            </span>
            <span className="hist-panel__label hist-panel__label--hist">
              <i />
              {t('historyVersion')}
              {selected ? (
                <em className={sameAsCurrent ? 'is-same' : 'is-diff'}>
                  {sameAsCurrent ? t('historySame') : t('historyDifferent')}
                </em>
              ) : null}
            </span>
          </div>
          {!selected ? (
            <div className="hist-panel__empty hist-panel__empty--diff">{t('historyPick')}</div>
          ) : (
            <div className="hist-panel__diff">
              <Suspense fallback={<div className="hist-panel__empty">{t('loading')}</div>}>
                <DiffLazy
                  key={selectedKey}
                  original={currentContent}
                  modified={selected.content ?? ''}
                  language={lang}
                  theme={theme}
                  fontSize={fontSize}
                  apiRef={apiRef}
                />
              </Suspense>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

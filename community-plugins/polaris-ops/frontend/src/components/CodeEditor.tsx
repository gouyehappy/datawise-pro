import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_EDITOR_FONT_SIZE } from '../lib/editorPrefs'
import { configureMonaco, monacoLanguage } from '../lib/monaco'

type Props = {
  value: string
  readOnly?: boolean
  language?: string
  fontSize?: number
  onChange?: (value: string) => void
}

const MonacoLazy = lazy(async () => {
  const mod = await configureMonaco()
  return {
    default: function MonacoInner(props: {
      value: string
      language: string
      readOnly?: boolean
      theme: string
      fontSize: number
      onChange?: (v: string) => void
    }) {
      const Editor = mod.default
      return (
        <Editor
          height="100%"
          language={props.language}
          theme={props.theme}
          value={props.value}
          onChange={(v) => props.onChange?.(v ?? '')}
          options={{
            readOnly: props.readOnly,
            minimap: { enabled: false },
            automaticLayout: true,
            fontSize: props.fontSize,
            lineHeight: Math.round(props.fontSize * 1.55),
            fontFamily: 'var(--mono)',
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            tabSize: 2,
            renderLineHighlight: 'line',
            folding: true,
            stickyScroll: { enabled: false },
            padding: { top: 8, bottom: 8 },
          }}
        />
      )
    },
  }
})

function PlainFallback({ value, readOnly, language, fontSize, onChange }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutRef = useRef<HTMLPreElement>(null)
  const lines = useMemo(() => {
    const n = Math.max(1, (value || '').split('\n').length)
    return Array.from({ length: n }, (_, i) => String(i + 1)).join('\n')
  }, [value])

  useEffect(() => {
    const ta = taRef.current
    const gut = gutRef.current
    if (!ta || !gut) return
    const sync = () => {
      gut.scrollTop = ta.scrollTop
    }
    ta.addEventListener('scroll', sync)
    return () => ta.removeEventListener('scroll', sync)
  }, [])

  const size = fontSize ?? DEFAULT_EDITOR_FONT_SIZE

  return (
    <div className="code-editor__body" style={{ ['--editor-fs' as string]: `${size}px` }}>
      <pre className="code-editor__gutter" ref={gutRef} aria-hidden>
        {lines}
      </pre>
      <textarea
        ref={taRef}
        className="code-editor__input"
        spellCheck={false}
        wrap="off"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
      <span className="code-editor__fallback-hint" data-lang={language} />
    </div>
  )
}

export function CodeEditor({
  value,
  readOnly,
  language,
  fontSize = DEFAULT_EDITOR_FONT_SIZE,
  onChange,
}: Props) {
  const [theme, setTheme] = useState('vs-dark')
  const lang = monacoLanguage(language)

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
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-dw-theme'] })
    return () => obs.disconnect()
  }, [])

  return (
    <div
      className={`code-editor ${readOnly ? 'is-readonly' : ''}`}
      data-lang={lang}
      style={{ ['--editor-fs' as string]: `${fontSize}px` }}
    >
      <div className="code-editor__chrome">
        <span className="code-editor__lang">{lang}</span>
        <span className="code-editor__hint">{readOnly ? 'read-only' : 'Monaco · UTF-8'}</span>
      </div>
      <div className="code-editor__monaco">
        <Suspense
          fallback={
            <PlainFallback
              value={value}
              readOnly={readOnly}
              language={lang}
              fontSize={fontSize}
              onChange={onChange}
            />
          }
        >
          <MonacoLazy
            value={value}
            language={lang}
            readOnly={readOnly}
            theme={theme}
            fontSize={fontSize}
            onChange={onChange}
          />
        </Suspense>
      </div>
    </div>
  )
}

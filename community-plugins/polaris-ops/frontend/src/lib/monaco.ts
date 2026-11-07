type ReactMonacoModule = typeof import('@monaco-editor/react')

let monacoSetupPromise: Promise<ReactMonacoModule> | null = null

export function configureMonaco(): Promise<ReactMonacoModule> {
  if (!monacoSetupPromise) {
    monacoSetupPromise = Promise.all([
      import('@monaco-editor/react'),
      import('monaco-editor/esm/vs/editor/editor.api.js'),
      // DiffEditor needs its contribution + registrations; editor.api alone won't compute line changes.
      import('monaco-editor/esm/vs/editor/browser/widget/diffEditor/diffEditor.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/xml/xml.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/html/html.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js'),
      import('monaco-editor/esm/vs/basic-languages/ini/ini.contribution.js'),
      import('monaco-editor/esm/vs/editor/editor.worker?worker&inline'),
    ])
      .then(([reactMonacoModule, monacoModule, , , , , , , workerModule]) => {
        const MonacoWorker = workerModule.default
        const globalScope = globalThis as typeof globalThis & {
          MonacoEnvironment?: { getWorker: (workerId: string, label: string) => Worker }
        }
        globalScope.MonacoEnvironment = {
          getWorker() {
            return new MonacoWorker()
          },
        }
        // Lightweight: treat JSON as JS for highlighting (avoids json.worker).
        try {
          monacoModule.languages.register({ id: 'json' })
        } catch {
          /* already registered */
        }
        reactMonacoModule.loader.config({ monaco: monacoModule })
        return reactMonacoModule
      })

      .catch((error) => {
        monacoSetupPromise = null
        throw error
      })
  }
  return monacoSetupPromise
}

export function monacoLanguage(type?: string): string {
  const t = String(type || 'text').toLowerCase()
  if (t === 'json') return 'json'
  if (t === 'yaml' || t === 'yml') return 'yaml'
  if (t === 'xml') return 'xml'
  if (t === 'html') return 'html'
  if (t === 'properties' || t === 'ini' || t === 'conf' || t === 'toml') return 'ini'
  if (t === 'js' || t === 'javascript') return 'javascript'
  return 'plaintext'
}

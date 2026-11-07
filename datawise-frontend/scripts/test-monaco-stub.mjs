/** Minimal monaco-editor stub for Node unit tests (avoids browser DOM at import time). */
const noop = () => {}
const emptyObj = {}
const editorApi = {
    create: () => ({
        dispose: noop,
        getModel: () => null,
        getValue: () => '',
        setValue: noop,
        onDidChangeModelContent: () => ({dispose: noop}),
    }),
    createModel: () => ({dispose: noop}),
    setModelLanguage: noop,
    defineTheme: noop,
    setTheme: noop,
    getModels: () => [],
    registerCommand: noop,
    registerEditorOpener: noop,
    onDidCreateEditor: () => ({dispose: noop}),
    onDidCreateModel: () => ({dispose: noop}),
    RemeasureFonts: noop,
}
const languagesApi = {
    register: () => ({dispose: noop}),
    setMonarchTokensProvider: noop,
    setLanguageConfiguration: noop,
    registerCompletionItemProvider: () => ({dispose: noop}),
    registerHoverProvider: () => ({dispose: noop}),
    registerDocumentFormattingEditProvider: () => ({dispose: noop}),
    typescript: {typescriptDefaults: {setCompilerOptions: noop, setDiagnosticsOptions: noop}},
    json: {jsonDefaults: {setDiagnosticsOptions: noop}},
}

export default editorApi
export const editor = editorApi
export const languages = languagesApi
export const Uri = {parse: (value) => ({toString: () => String(value)})}
export const Range = emptyObj
export const KeyCode = new Proxy(emptyObj, {get: () => 0})
export const KeyMod = new Proxy(emptyObj, {get: () => 0})

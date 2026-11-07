/** Minimal monaco-editor stub for Node unit tests (CJS require path). */
const noop = () => {}
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

module.exports = {
    default: editorApi,
    editor: editorApi,
    languages: languagesApi,
    Uri: {parse: (value) => ({toString: () => String(value)})},
    Range: {},
    KeyCode: new Proxy({}, {get: () => 0}),
    KeyMod: new Proxy({}, {get: () => 0}),
}

import * as monaco from 'monaco-editor'

export const SSH_COMMAND_MONACO_LANGUAGE = 'dw-ssh-commands'

let registered = false

/** Register Monarch language + completions for SSH quick-command DSL (idempotent). */
export function ensureSshCommandMonacoLanguage(): void {
    if (registered) return
    registered = true

    monaco.languages.register({id: SSH_COMMAND_MONACO_LANGUAGE})

    monaco.languages.setMonarchTokensProvider(SSH_COMMAND_MONACO_LANGUAGE, {
        defaultToken: '',
        tokenizer: {
            root: [
                [/^@(?:run|paste)\b.*$/, 'keyword'],
                [/^#.*$/, 'comment'],
                [/\{\{[A-Za-z_][\w.-]*\}\}/, 'variable'],
                [/!(?:run|paste)\b/, 'keyword'],
                [/./, ''],
            ],
        },
    })

    monaco.languages.setLanguageConfiguration(SSH_COMMAND_MONACO_LANGUAGE, {
        comments: {lineComment: '#'},
        brackets: [
            ['{', '}'],
            ['(', ')'],
            ['[', ']'],
        ],
        autoClosingPairs: [
            {open: '{', close: '}'},
            {open: '(', close: ')'},
            {open: '[', close: ']'},
            {open: '"', close: '"'},
            {open: "'", close: "'"},
            {open: '`', close: '`'},
        ],
        surroundingPairs: [
            {open: '{', close: '}'},
            {open: '(', close: ')'},
            {open: '[', close: ']'},
            {open: '"', close: '"'},
            {open: "'", close: "'"},
            {open: '`', close: '`'},
        ],
    })
}

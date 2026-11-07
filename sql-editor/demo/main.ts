import {createApp} from 'vue'
import App from './App.vue'
import {installSqlEditorPlugin} from '@sql-editor/index'
import {ensureSqlEditorMonacoThemes} from '@sql-editor/monaco/themes'
import {SQL_EDITOR_DARK_THEME} from '@sql-editor/constants/editor-themes'

ensureSqlEditorMonacoThemes()

const app = createApp(App)
installSqlEditorPlugin(app, {
    config: {
        theme: SQL_EDITOR_DARK_THEME,
        monacoOptions: () => ({fontSize: 14, fontFamily: 'JetBrains Mono, Consolas, monospace'}),
    },
})
app.mount('#app')

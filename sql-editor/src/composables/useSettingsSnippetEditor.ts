import {reactive, ref, type Ref} from 'vue'
import type {SqlCompletionSlot, SqlSnippetConfig} from '@sql-editor/types'

type SnippetDraft = {
    label: string
    insertText: string
    detail: string
}

type SnippetEditorDeps = {
    snippets: Ref<readonly SqlSnippetConfig[]>
    addCustomSnippet: (input: {
        label: string
        insertText: string
        detail: string
        slots: SqlCompletionSlot[]
    }) => string | null
    upsertPersonalSnippet: (id: string, patch: SnippetDraft) => void
    removePersonalSnippet: (id: string) => void
    hasSnippetOverride: (id: string) => boolean
}

function copySnippetToDraft(target: SnippetDraft, source: SqlSnippetConfig) {
    target.label = source.label
    target.insertText = source.insertText
    target.detail = source.detail
}

function clearDraft(target: SnippetDraft) {
    target.label = ''
    target.insertText = ''
    target.detail = ''
}

/**
 * 设置面板「片段」标签的展开编辑与新建表单状态。
 */
export function useSettingsSnippetEditor(deps: SnippetEditorDeps) {
    const expandedId = ref<string | null>(null)
    const showAddForm = ref(false)
    const draft = reactive<SnippetDraft>({label: '', insertText: '', detail: ''})
    const newDraft = reactive<SnippetDraft & { slot: SqlCompletionSlot }>({
        label: '',
        insertText: '',
        detail: '',
        // 默认语句开头：空编辑器最常见；WHERE 需先写到 WHERE 子句才出提示
        slot: 'statement_start',
    })

    function close() {
        expandedId.value = null
        showAddForm.value = false
    }

    function open(item: SqlSnippetConfig) {
        expandedId.value = item.id
        copySnippetToDraft(draft, item)
    }

    function toggle(item: SqlSnippetConfig) {
        if (expandedId.value === item.id) {
            expandedId.value = null
            return
        }
        open(item)
    }

    function save() {
        if (!expandedId.value) return
        deps.upsertPersonalSnippet(expandedId.value, {
            label: draft.label,
            insertText: draft.insertText,
            detail: draft.detail,
        })
    }

    function remove() {
        if (!expandedId.value) return
        if (deps.hasSnippetOverride(expandedId.value)) {
            deps.removePersonalSnippet(expandedId.value)
        }
        expandedId.value = null
    }

    function submitNew() {
        const id = deps.addCustomSnippet({
            label: newDraft.label,
            insertText: newDraft.insertText,
            detail: newDraft.detail,
            slots: [newDraft.slot],
        })
        if (!id) return

        clearDraft(newDraft)
        showAddForm.value = false

        const created = deps.snippets.value.find((item) => item.id === id)
        if (created) open(created)
    }

    return {
        expandedId,
        showAddForm,
        draft,
        newDraft,
        toggle,
        open,
        close,
        save,
        remove,
        submitNew,
    }
}

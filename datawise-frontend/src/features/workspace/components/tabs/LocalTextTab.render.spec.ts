import {describe, it, expect, vi, beforeEach} from 'vitest'
import {mount, flushPromises} from '@vue/test-utils'
import {computed, defineAsyncComponent, defineComponent, h, nextTick, ref} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {createI18n} from 'vue-i18n'
import ConfirmDialog from '@/core/components/ConfirmDialog.vue'

vi.mock('monaco-editor', () => ({
  editor: {create: vi.fn(), setTheme: vi.fn(), setModelLanguage: vi.fn()},
  Range: class {},
  Selection: class {},
}))

vi.mock('@/core/components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'extraOptions', 'gitLineMarks'],
    emits: ['update:modelValue', 'focus', 'blur'],
    setup(_, {expose}) {
      expose({
        layout: () => undefined,
        getScrollRatio: () => 0,
        setScrollRatio: () => undefined,
        onDidScroll: () => () => undefined,
        goToLine: () => undefined,
        getVisibleTopLine: () => 1,
        setGitLineMarks: () => undefined,
        clearGitLineMarks: () => undefined,
        hasFocus: () => false,
      })
      return () => h('div', 'monaco')
    },
  }),
}))

vi.mock('@/features/local-files/services/local-files-git-diff', () => ({
  fetchLocalGitLineMarks: vi.fn(async () => []),
}))

vi.mock('@/features/local-files/services/local-files-markdown-assets', () => ({
  loadLocalMarkdownAssetDataUrls: vi.fn(async () => ({})),
}))

vi.mock('@/core/icons', () => ({
  DwIcon: defineComponent({
    name: 'DwIcon',
    props: ['name', 'size', 'strokeWidth', 'fit', 'active'],
    setup() {
      return () => h('span')
    },
  }),
  ensureDeferredDwIcons: () => Promise.resolve(),
}))

vi.mock('@/features/workspace/composables/useLocalTextEditorShortcuts', () => ({
  useLocalTextEditorShortcuts: () => ({
    deleteConfirm: {
      open: ref(false),
      title: ref(''),
      message: ref(''),
      confirmLabel: ref<string | undefined>(undefined),
      confirmVariant: ref<'primary' | 'danger'>('danger'),
      confirmLoading: ref(false),
      onOpenUpdate: () => undefined,
      onConfirm: () => undefined,
    },
    unsavedCloseOpen: ref(false),
    unsavedCloseTitle: computed(() => 'Unsaved'),
    unsavedCloseMessage: computed(() => 'Save?'),
    resolveUnsavedClose: () => undefined,
    saveShortcutTitle: computed(() => 'Save'),
    openShortcutTitle: computed(() => 'Open'),
    deleteShortcutTitle: computed(() => 'Delete'),
    openFile: () => undefined,
    deleteFile: () => undefined,
  }),
}))

vi.mock('@/features/workspace/stores/workspace', () => ({
  useWorkspaceStore: () => ({
    updateTabSql: vi.fn(),
    isTabDirty: () => false,
    saveDirtyTab: vi.fn(async () => true),
    activeTabId: 'lt-1',
    tabActivateRefreshSeq: {},
    closeTab: vi.fn(),
    tabs: [],
  }),
}))

vi.mock('@/features/layout/stores/layout', () => ({
  useLayoutStore: () => ({
    showErrorToast: vi.fn(),
    isDatabaseModule: true,
  }),
}))

vi.mock('@/features/explorer/stores/explorer', () => ({
  useExplorerStore: () => ({panelMode: 'files'}),
}))

vi.mock('@/features/local-files/stores/local-files-store', () => ({
  useLocalFilesStore: () => ({
    rootPath: 'E:/docs',
    remove: vi.fn(),
    beginCreate: vi.fn(),
  }),
}))

function createI18nPlugin() {
  return createI18n({
    legacy: false,
    locale: 'en-US',
    missingWarn: false,
    fallbackWarn: false,
    messages: {'en-US': {}},
  })
}

describe('LocalTextTab / ConfirmDialog render (vue+reka-ui single runtime)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('ConfirmDialog under defineAsyncComponent does not throw render function', async () => {
    let captured: {err: unknown; info: string} | null = null
    const open = ref(false)
    const Inner = defineComponent({
      name: 'InnerWithConfirm',
      setup() {
        return () =>
          h(ConfirmDialog, {
            open: open.value,
            title: 'T',
            message: 'M',
            confirmVariant: 'danger',
          })
      },
    })
    const AsyncInner = defineAsyncComponent(() => Promise.resolve(Inner))
    const Parent = defineComponent({
      errorCaptured(err, _i, info) {
        captured = {err, info: String(info)}
        return false
      },
      setup() {
        return () => h(AsyncInner)
      },
    })
    const wrapper = mount(Parent, {global: {plugins: [createI18nPlugin()]}})
    await flushPromises()
    await nextTick()
    expect(captured).toBeNull()
    wrapper.unmount()
  })

  it('LocalTextTab mounts without opening dialogs (dialogs deferred)', async () => {
    let captured: {err: unknown; info: string} | null = null
    const {default: LocalTextTab} = await import('./LocalTextTab.vue')
    const tab = {
      id: 'lt-1',
      title: 'notes.md',
      type: 'local-text' as const,
      closable: true,
      localFilePath: 'E:/docs/notes.md',
      sql: '# Hello\n\nworld',
      savedContent: '# Hello\n\nworld',
    }
    const Parent = defineComponent({
      errorCaptured(err, _i, info) {
        captured = {err, info: String(info)}
        return false
      },
      setup() {
        return () => h(LocalTextTab, {tab, paneActive: true})
      },
    })
    const wrapper = mount(Parent, {
      global: {
        plugins: [createPinia(), createI18nPlugin()],
        stubs: {
          DwConsoleToolbar: {
            template: '<div><slot name="start"/><slot name="context"/></div>',
          },
          ResizeHandle: true,
          IconButton: true,
          LocalMarkdownToc: true,
          EmptyState: true,
        },
      },
    })
    await flushPromises()
    await nextTick()
    if (captured) {
      // eslint-disable-next-line no-console
      console.error('LocalTextTab captured', captured.info, captured.err)
    }
    expect(captured).toBeNull()
    wrapper.unmount()
  }, 30_000)
})

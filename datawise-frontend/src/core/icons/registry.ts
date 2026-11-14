import type {Component} from 'vue'
import {registerDwIcons} from '@datawise/icons'
import {
    Activity,
    AlignCenter,
    AlignLeft,
    ArrowLeftRight,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    BarChart3,
    Bell,
    BookOpen,
    Bookmark,
    Bot,
    Cable,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ChevronsDown,
    ChevronsUp,
    Calendar,
    CircleAlert,
    CircleHelp,
    Code,
    Columns2,
    Columns3,
    Command,
    Copy,
    Cpu,
    Crosshair,
    Database,
    Dices,
    Download,
    ExternalLink,
    Eye,
    EyeOff,
    File,
    FileCode,
    FileJson,
    FileOutput,
    FileText,
    Files,
    Filter,
    Folder,
    FolderOpen,
    FoldVertical,
    Github,
    GripVertical,
    History,
    Home,
    Import,
    Info,
    Key,
    Keyboard,
    LayoutGrid,
    LayoutTemplate,
    Layers,
    Link,
    List,
    ListOrdered,
    ListPlus,
    ListMinus,
    ListTree,
    Lock,
    LogOut,
    Maximize2,
    MessageSquare,
    Minimize2,
    Minus,
    Moon,
    Network,
    Pencil,
    Pin,
    Play,
    Plus,
    RefreshCw,
    Save,
    ScrollText,
    Search,
    Send,
    Settings,
    Sparkles,
    Square,
    Star,
    Sun,
    Table,
    Terminal,
    Trash2,
    TriangleAlert,
    Undo2,
    UnfoldVertical,
    Unlock,
    Unplug,
    Upload,
    User,
    Users,
    Wrench,
    X,
    Zap,
    Ellipsis,
    ZoomIn,
    ZoomOut,
    Scan,
} from 'lucide-vue-next'

/** 全系统统一图标名（Lucide Icons） */
export type DwIconName =
    | 'plus'
    | 'minus'
    | 'list-plus'
    | 'list-minus'
    | 'help'
    | 'dices'
    | 'x'
    | 'chevron-down'
    | 'chevron-left'
    | 'chevron-right'
    | 'chevrons-left'
    | 'chevrons-right'
    | 'chevrons-down'
    | 'chevrons-up'
    | 'arrow-up'
    | 'arrow-down'
    | 'filter'
    | 'arrow-up-down'
    | 'visibility-off'
    | 'alert-circle'
    | 'alert-triangle'
    | 'check'
    | 'calendar'
    | 'info'
    | 'send'
    | 'history'
    | 'monitor'
    | 'migration'
    | 'feedback'
    | 'lock'
    | 'unlock'
    | 'user'
    | 'users'
    | 'log-out'
    | 'link'
    | 'key'
    | 'mic'
    | 'bot'
    | 'zap'
    | 'layers'
    | 'list-ordered'
    | 'star'
    | 'cpu'
    | 'open-external'
    | 'add'
    | 'refresh'
    | 'locate'
    | 'settings'
    | 'search'
    | 'list'
    | 'grid'
    | 'menu-group'
    | 'menu-connection'
    | 'menu-import'
    | 'run'
    | 'stop'
    | 'explain-plan'
    | 'submit'
    | 'rollback'
    | 'disconnect'
    | 'save'
    | 'save-as'
    | 'bookmark'
    | 'view-model'
    | 'format'
    | 'fold-all'
    | 'unfold-all'
    | 'fullscreen'
    | 'ai'
    | 'moon'
    | 'sun'
    | 'github'
    | 'explain'
    | 'optimize'
    | 'open'
    | 'folder'
    | 'console'
    | 'pin'
    | 'copy'
    | 'grip-vertical'
    | 'ddl'
    | 'table'
    | 'truncate'
    | 'edit'
    | 'export'
    | 'import'
    | 'delete'
    | 'close'
    | 'file'
    | 'code'
    | 'file-json'
    | 'file-sheet'
    | 'file-log'
    | 'file-braces'
    | 'connection'
    | 'database'
    | 'plugins'
    | 'dev-tools'
    | 'dashboard'
    | 'chart'
    | 'chart-bar'
    | 'chart-line'
    | 'chart-pie'
    | 'tools'
    | 'tree'
    | 'terminal'
    | 'align'
    | 'matrix'
    | 'usage'
    | 'connectors'
    | 'audit'
    | 'hooks'
    | 'notify'
    | 'command'
    | 'layout'
    | 'editor'
    | 'shortcuts'
    | 'about'
    | 'diff'
    | 'visibility'
    | 'comment-column'
    | 'comment-table'
    | 'comment-all'
    | 'settings-basic'
    | 'settings-layout'
    | 'settings-connection-health'
    | 'settings-system-metrics'
    | 'settings-profile'
    | 'settings-editor'
    | 'settings-sql-editor'
    | 'settings-shortcuts'
    | 'settings-plugins'
    | 'settings-ai'
    | 'settings-data-agent'
    | 'settings-knowledge'
    | 'settings-about'
    | 'tab-welcome'
    | 'tab-console'
    | 'tab-table'
    | 'tab-connection'
    | 'tab-terminal'
    | 'tab-schema-compare'
    | 'tab-schema-er'
    | 'tab-cross-env-compare'
    | 'tab-view-model'
    | 'tab-view-model-editor'
    | 'tab-redis-key'
    | 'tab-redis-console'
    | 'tab-mongo-console'
    | 'tab-kafka'
    | 'tab-yarn'
    | 'tab-jenkins'
    | 'tab-file'
    | 'ellipsis'
    | 'zoom-in'
    | 'zoom-out'
    | 'zoom-reset'
    | 'tour'

/**
 * Shell Lucide set (first paint). Deferred names are filled by
 * {@link ensureDeferredDwIcons} (PERF-09).
 */
export const DW_ICON_REGISTRY = {
    plus: Plus,
    minus: Minus,
    'list-plus': ListPlus,
    'list-minus': ListMinus,
    help: CircleHelp,
    dices: Dices,
    x: X,
    'chevron-down': ChevronDown,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'chevrons-left': ChevronsLeft,
    'chevrons-right': ChevronsRight,
    'chevrons-down': ChevronsDown,
    'chevrons-up': ChevronsUp,
    'arrow-up': ArrowUp,
    'arrow-down': ArrowDown,
    filter: Filter,
    'arrow-up-down': ArrowUpDown,
    'visibility-off': EyeOff,
    'alert-circle': CircleAlert,
    'alert-triangle': TriangleAlert,
    check: Check,
    calendar: Calendar,
    info: Info,
    send: Send,
    history: History,
    monitor: Activity,
    migration: Files,
    feedback: MessageSquare,
    lock: Lock,
    unlock: Unlock,
    user: User,
    users: Users,
    'log-out': LogOut,
    link: Link,
    key: Key,
    bot: Bot,
    zap: Zap,
    layers: Layers,
    'list-ordered': ListOrdered,
    star: Star,
    cpu: Cpu,
    'open-external': ExternalLink,
    add: Plus,
    refresh: RefreshCw,
    locate: Crosshair,
    settings: Settings,
    search: Search,
    list: List,
    grid: LayoutGrid,
    'menu-group': LayoutGrid,
    'menu-connection': Database,
    'menu-import': Import,
    run: Play,
    stop: Square,
    submit: Check,
    rollback: Undo2,
    disconnect: Unplug,
    save: Save,
    'save-as': FileOutput,
    bookmark: Bookmark,
    'view-model': LayoutTemplate,
    format: AlignLeft,
    'fold-all': FoldVertical,
    'unfold-all': UnfoldVertical,
    fullscreen: Maximize2,
    ai: Sparkles,
    moon: Moon,
    sun: Sun,
    github: Github,
    explain: Info,
    optimize: Sparkles,
    open: FolderOpen,
    folder: Folder,
    console: Terminal,
    pin: Pin,
    copy: Copy,
    'grip-vertical': GripVertical,
    ddl: FileCode,
    table: Table,
    truncate: ArrowLeftRight,
    edit: Pencil,
    export: Upload,
    import: Download,
    delete: Trash2,
    close: X,
    file: File,
    code: Code,
    'file-json': FileJson,
    'file-log': ScrollText,
    connection: Database,
    database: Database,
    plugins: LayoutGrid,
    'dev-tools': Wrench,
    dashboard: BarChart3,
    chart: BarChart3,
    tools: Wrench,
    tree: ListTree,
    terminal: Terminal,
    align: AlignCenter,
    connectors: Cable,
    notify: Bell,
    command: Command,
    layout: Columns2,
    editor: FileText,
    shortcuts: Keyboard,
    about: Info,
    visibility: Eye,
    'comment-column': Columns3,
    'comment-table': Table,
    'comment-all': List,
    'settings-layout': Columns2,
    'settings-connection-health': Activity,
    'settings-profile': User,
    'settings-editor': FileText,
    'settings-shortcuts': Keyboard,
    'settings-plugins': LayoutGrid,
    'settings-ai': Sparkles,
    'settings-data-agent': Network,
    'settings-knowledge': BookOpen,
    'settings-about': Info,
    'tab-welcome': Home,
    /* SQL scripts: FileCode reads clearer than Terminal next to SSH/xterm tabs. */
    'tab-console': FileCode,
    'tab-table': Table,
    'tab-connection': Database,
    'tab-terminal': Terminal,
    'tab-schema-er': Network,
    'tab-cross-env-compare': Columns2,
    'tab-view-model': FileText,
    'tab-view-model-editor': FileText,
    'tab-redis-key': Key,
    'tab-redis-console': Terminal,
    'tab-mongo-console': FileJson,
    'tab-kafka': MessageSquare,
    'tab-yarn': Cpu,
    'tab-jenkins': Cpu,
    'tab-file': File,
    ellipsis: Ellipsis,
    'zoom-in': ZoomIn,
    'zoom-out': ZoomOut,
    'zoom-reset': Scan,
    tour: BookOpen,
} as Record<DwIconName, Component>

let deferredIconsPromise: Promise<void> | null = null
let deferredIconsReady = false

/** PERF-09: load rare Lucide icons into the registry (idempotent). */
export function ensureDeferredDwIcons(): Promise<void> {
    if (deferredIconsReady) return Promise.resolve()
    if (!deferredIconsPromise) {
        deferredIconsPromise = import('@/core/icons/registry-deferred')
            .then((mod) => {
                Object.assign(DW_ICON_REGISTRY, mod.DW_ICON_DEFERRED_REGISTRY)
                registerDwIcons(mod.DW_ICON_DEFERRED_REGISTRY as Record<string, Component>)
                deferredIconsReady = true
            })
            .catch((error) => {
                deferredIconsPromise = null
                throw error
            })
    }
    return deferredIconsPromise
}

export function resolveDwIcon(
    name: DwIconName,
    options?: {active?: boolean},
): Component {
    if (name === 'fullscreen') {
        return options?.active ? Minimize2 : Maximize2
    }
    const icon = DW_ICON_REGISTRY[name]
    if (!icon) {
        void ensureDeferredDwIcons()
        return Info
    }
    return icon
}

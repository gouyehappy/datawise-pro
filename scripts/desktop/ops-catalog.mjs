/**
 * Shared action catalog for ops CLI / Web / Cursor tasks.
 * kind: 'npm' | 'node' | 'dw'
 */
export const GROUPS = [
    {id: 'release', title: '发版与 CNB', hint: '升版本、推代码、镜像安装包'},
    {id: 'dev', title: '开发联调', hint: '启动 / 停止本机开发环境'},
    {id: 'build', title: '编译打包', hint: '前后端、安装包'},
    {id: 'quality', title: '质量检查', hint: '类型检查、门禁、对齐'},
    {id: 'plugins', title: '插件与其它', hint: '社区插件、官网、mock'},
]

/** @type {Array<{id:string, group:string, title:string, desc:string, kind:string, script?:string, args?:string[], confirm?:boolean, long?:boolean, inline?:boolean}>} */
export const ACTIONS = [
    // release
    {
        id: 'ship-status',
        group: 'release',
        title: '查看发版状态',
        desc: '版本号 / tag / 工作区是否干净',
        kind: 'node',
        script: 'scripts/desktop/ship-release.mjs',
        args: ['--step', 'status'],
        inline: true,
    },
    {
        id: 'ship-wizard',
        group: 'release',
        title: '打开发版向导（终端）',
        desc: '智能推荐下一步，适合逐步确认',
        kind: 'node',
        script: 'scripts/desktop/ship-release-menu.mjs',
        long: true,
    },
    {
        id: 'ship-patch',
        group: 'release',
        title: '一键发下一版（patch）',
        desc: '升版本 → 提交 → push + tag（触发 CI；工作日仍受 pre-push 保护）',
        kind: 'node',
        script: 'scripts/desktop/ship-release.mjs',
        args: ['--bump', 'patch', '--yes'],
        confirm: true,
        long: true,
    },
    {
        id: 'cnb-push-code',
        group: 'release',
        title: '推代码到 CNB（空仓必做）',
        desc: '需要 CNB_TOKEN；推送 main + tags',
        kind: 'node',
        script: 'scripts/desktop/push-code-to-cnb.mjs',
        args: ['--branch', 'main', '--tags', '--yes'],
        confirm: true,
        long: true,
    },
    {
        id: 'cnb-mirror',
        group: 'release',
        title: '镜像安装包到 CNB',
        desc: '从 GitHub Release 同步增量包；需 CNB_TOKEN',
        kind: 'npm',
        script: 'mirror:cnb',
        confirm: true,
        long: true,
    },

    // dev
    {id: 'dev', group: 'dev', title: '启动开发联调（全量）', desc: 'npm run dev', kind: 'dw', script: 'dev', long: true},
    {
        id: 'dev-standard',
        group: 'dev',
        title: '启动开发联调（标准版）',
        desc: 'npm run dev:standard',
        kind: 'dw',
        script: 'dev:standard',
        long: true,
    },
    {id: 'dev-frontend', group: 'dev', title: '仅前端 Vite', desc: 'npm run dev:frontend', kind: 'npm', script: 'dev:frontend', long: true},
    {
        id: 'stop',
        group: 'dev',
        title: '停止开发联调',
        desc: 'node scripts/dev-stop.mjs（与 stop.bat / 菜单 S 一致）',
        kind: 'node',
        script: 'scripts/dev-stop.mjs',
        inline: true,
    },

    // build
    {id: 'frontend', group: 'build', title: '编译前端（全量）', desc: 'npm run frontend', kind: 'dw', script: 'frontend', long: true},
    {
        id: 'frontend-standard',
        group: 'build',
        title: '编译前端（标准版）',
        desc: 'npm run frontend:standard',
        kind: 'dw',
        script: 'frontend:standard',
        long: true,
    },
    {id: 'backend', group: 'build', title: '编译后端（全量）', desc: 'npm run backend', kind: 'dw', script: 'backend', long: true},
    {
        id: 'backend-standard',
        group: 'build',
        title: '编译后端（标准版）',
        desc: 'npm run backend:standard',
        kind: 'dw',
        script: 'backend:standard',
        long: true,
    },
    {id: 'plugins', group: 'build', title: '编译连接器插件', desc: 'npm run plugins', kind: 'dw', script: 'plugins', long: true},
    {id: 'dist', group: 'build', title: '打桌面安装包（core）', desc: 'npm run dist', kind: 'dw', script: 'dist', long: true},
    {id: 'dist-slim', group: 'build', title: '打桌面瘦包', desc: 'npm run dist:slim', kind: 'dw', script: 'dist:slim', long: true},
    {id: 'dist-full', group: 'build', title: '打桌面全量包', desc: 'npm run dist:full', kind: 'dw', script: 'dist:full', long: true},
    {
        id: 'dist-publish',
        group: 'build',
        title: '本机打包并上传 GitHub',
        desc: '需 GH_TOKEN',
        kind: 'dw',
        script: 'dist:publish',
        confirm: true,
        long: true,
    },
    {
        id: 'all',
        group: 'build',
        title: '一键全量编译打包',
        desc: 'clean + backend + plugins + frontend + dist',
        kind: 'dw',
        script: 'all',
        confirm: true,
        long: true,
    },
    {id: 'clean', group: 'build', title: '清理构建产物', desc: 'npm run clean', kind: 'dw', script: 'clean'},

    // quality
    {
        id: 'check-version',
        group: 'quality',
        title: '版本号对齐检查',
        desc: 'check:version-alignment',
        kind: 'npm',
        script: 'check:version-alignment',
    },
    {
        id: 'typecheck-fe',
        group: 'quality',
        title: '前端类型检查',
        desc: 'typecheck:frontend',
        kind: 'npm',
        script: 'typecheck:frontend',
        long: true,
    },
    {id: 'typecheck', group: 'quality', title: '全量类型检查', desc: 'typecheck', kind: 'npm', script: 'typecheck', long: true},
    {
        id: 'pre-commit',
        group: 'quality',
        title: '提交前门禁',
        desc: 'pre-commit-check',
        kind: 'node',
        script: 'scripts/pre-commit-check.mjs',
    },
    {
        id: 'audit-boundary',
        group: 'quality',
        title: 'packages 边界审计',
        desc: 'audit:packages-boundary',
        kind: 'npm',
        script: 'audit:packages-boundary',
    },
    {
        id: 'check-caps',
        group: 'quality',
        title: '连接能力矩阵检查',
        desc: 'check:connection-capabilities',
        kind: 'npm',
        script: 'check:connection-capabilities',
    },
    {id: 'help', group: 'quality', title: '列出 dw 命令帮助', desc: 'npm run help', kind: 'dw', script: 'help'},

    // plugins
    {id: 'plugin', group: 'plugins', title: '社区插件 CLI', desc: 'npm run plugin', kind: 'npm', script: 'plugin'},
    {
        id: 'smoke-plugin',
        group: 'plugins',
        title: '社区插件冒烟',
        desc: 'smoke:community-plugin',
        kind: 'dw',
        script: 'smoke:community-plugin',
        long: true,
    },
    {
        id: 'clean-dwp',
        group: 'plugins',
        title: '清理插件暂存目录',
        desc: 'clean:dwp-staging',
        kind: 'npm',
        script: 'clean:dwp-staging',
    },
    {
        id: 'mock-market',
        group: 'plugins',
        title: '模拟连接器市场',
        desc: 'mock:connector-market',
        kind: 'npm',
        script: 'mock:connector-market',
        long: true,
    },
    {id: 'website', group: 'plugins', title: '官网本地预览', desc: 'npm run website', kind: 'npm', script: 'website', long: true},
    {
        id: 'website-build',
        group: 'plugins',
        title: '构建官网',
        desc: 'npm run website:build',
        kind: 'npm',
        script: 'website:build',
        long: true,
    },
    {
        id: 'export-openapi',
        group: 'plugins',
        title: '导出 OpenAPI',
        desc: '需后端已启动',
        kind: 'npm',
        script: 'export:openapi',
    },
]

export function actionsByGroup(groupId) {
    return ACTIONS.filter((a) => a.group === groupId)
}

export function findAction(id) {
    return ACTIONS.find((a) => a.id === id) || null
}

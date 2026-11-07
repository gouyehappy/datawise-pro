/**
 * DataWise 常用命令入口（仓库根目录）。
 *
 *   node scripts/dw.mjs <command> [-- args…]
 *   npm run <command> [-- args…]
 *
 * 只保留日常会用到的几条；细节脚本仍在 datawise-frontend/package.json。
 */
import {spawnSync} from 'node:child_process'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const frontend = join(root, 'datawise-frontend')
const backend = join(root, 'datawise-backend')
const isWin = process.platform === 'win32'

const COMMANDS = {
    clean: {
        title: '项目清理',
        desc: '清理前端 dist / 桌面产物 / 后端 target',
    },
    frontend: {
        title: '前端编译打包',
        desc: 'vue-tsc + Vite 构建桌面前端（DATAWISE_DESKTOP，全量版）',
    },
    'frontend:standard': {
        title: '标准版前端打包',
        desc: 'VITE_DATAWISE_EDITION=standard：付费入口改为 stub，产出可发标准版静态资源',
    },
    backend: {
        title: '后端编译打包',
        desc: 'Maven 编译 Spring Boot 服务端 JAR（跳过测试，全量模块）',
    },
    'backend:standard': {
        title: '标准版后端胖包',
        desc: '剥离 AI/血缘/MetaDoc/造数/迁移/备份等付费模块后打 datawise-server 胖包',
    },
    plugins: {
        title: '后端插件',
        desc: '编译连接器插件并输出到 config/plugins/',
    },
    all: {
        title: '全部',
        desc: '清理后依次：后端 + 插件 + 前端 + 桌面打包',
    },
    dist: {
        title: '桌面安装包（默认 core）',
        desc: '当前系统 JCEF 包：zip + 安装程序；默认 profile=core（常用连接器，非 full）',
    },
    'dist:slim': {
        title: '桌面瘦包',
        desc: '同 dist，profile=slim（无连接器 JAR；按需安装）',
    },
    'dist:full': {
        title: '桌面全量包（可选）',
        desc: '同 dist，profile=full（全连接器；体积更大，非默认发布）',
    },
    'dist:publish': {
        title: '桌面打包并发布',
        desc: '同 dist（默认 core），并上传到 GitHub Releases（需 GH_TOKEN）',
    },
    dev: {
        title: '开发联调（全量）',
        desc: 'Vite + 同 JVM（Spring Boot + JetBrains JCEF）；旧双进程：npm run dev -- --dual',
    },
    'dev:standard': {
        title: '开发联调（标准版）',
        desc: '同 npm run dev，但前端以标准版编译（付费能力走 stub/paywall）；后端仍为本机全量服务',
    },
    stop: {
        title: '停止联调',
        desc: '停止开发联调拉起的进程',
    },
    'smoke:community-plugin': {
        title: '社区插件冒烟',
        desc: '打包 hello .dwp，并跑安装/签名/卸载相关单测',
    },
    plugin: {
        title: '社区插件 CLI',
        desc: 'package / keygen（薄封装 Java DwpPackageTool）',
    },
}

/** 与 scripts/pack/without-ai-jar-scan.sh / PACK_BUILD_COMMANDS.md 一致 */
const STANDARD_EXCLUDES =
    'org.openjdk.jmh:jmh-core,org.openjdk.jmh:jmh-generator-annprocess,' +
    'org.apache.datawise:datawise-ai,org.apache.datawise:datawise-lineage,' +
    'org.apache.datawise:datawise-metadoc,org.apache.datawise:datawise-datagen,' +
    'org.apache.datawise:datawise-sync,org.apache.datawise:datawise-backup'

function run(command, args, cwd = root) {
    const result = spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell: isWin,
        env: process.env,
    })
    if (result.error) throw result.error
    if (result.status !== 0) {
        process.exit(result.status ?? 1)
    }
}

function npmFrontend(...args) {
    run(isWin ? 'npm.cmd' : 'npm', ['run', ...args], frontend)
}

/** Pass through: npm run dist -- --no-installer */
function npmFrontendWithArgs(script, extraArgs) {
    const args = ['run', script]
    if (extraArgs.length > 0) {
        args.push('--', ...extraArgs)
    }
    run(isWin ? 'npm.cmd' : 'npm', args, frontend)
}

function mvn(...args) {
    run(isWin ? 'mvn.cmd' : 'mvn', args, backend)
}

function printDistHint() {
    console.log(`
产物目录: datawise-frontend/release/
  · DataWiseCLI-{ver}-{os}-{arch}.zip
  · Windows: *-windows-x64-setup.exe   (需 WiX 3.x)
  · macOS:   *-macos-{arm64|x64}.dmg
  · Linux:   *-linux-{x64|arm64}.deb   (需 fakeroot)

常用参数（接在 -- 后面）:
  --no-installer     只打 zip，不打安装程序
  --profile=slim|core|full
                     默认 core（常用连接器）；slim=按需安装；full=全量（非默认发布）
  --dir              只组装目录，不打 zip/安装包
  --publish          上传 GitHub Releases（或用 npm run dist:publish）

须在目标操作系统上打包（不可交叉编译）；三端请用 CI: desktop-release.yml
发布建议：GitHub Releases 默认打 core；需要全量时显式 npm run dist:full
`)
}

function printHelp() {
    console.log(`
DataWise 常用命令（在仓库根目录执行）

  npm run <命令>


命令：`)
    const width = Math.max(...Object.keys(COMMANDS).map((id) => id.length), 14)
    for (const [id, meta] of Object.entries(COMMANDS)) {
        console.log(`  ${id.padEnd(width)}  ${meta.title}  —  ${meta.desc}`)
    }
    console.log(`
示例：
  npm run clean
  npm run frontend
  npm run frontend:standard   # 标准版前端静态资源
  npm run backend
  npm run backend:standard    # 标准版后端胖包（剥离付费模块）
  npm run plugins
  npm run all
  npm run dist
  npm run dist -- --no-installer
  npm run dist:full
  npm run dist:publish
  npm run dev                 # 全量联调
  npm run dev:standard        # 标准版前端联调（付费入口 stub）
  npm run stop

说明：
  · 全量版 = 默认开发/发版能力全集
  · 标准版 = 前端 stub 付费页 +（可选）后端胖包排除 AI/迁移/备份等模块
  · npm run help 可随时查看本列表
`)
    printDistHint()
}

async function main() {
    const cmd = (process.argv[2] || 'help').toLowerCase()
    const extra = process.argv.slice(3)

    switch (cmd) {
        case 'help':
        case '-h':
        case '--help':
            printHelp()
            return
        case 'clean':
            console.log(`\n▶ ${COMMANDS.clean.title}\n`)
            npmFrontend('clean:desktop')
            return
        case 'frontend':
            console.log(`\n▶ ${COMMANDS.frontend.title}\n`)
            npmFrontend('build:desktop')
            return
        case 'frontend:standard':
            console.log(`\n▶ ${COMMANDS['frontend:standard'].title}\n`)
            console.log('说明：标准版前端 — 付费能力入口编译为 stub/paywall。\n')
            npmFrontend('build:standard')
            return
        case 'backend':
            console.log(`\n▶ ${COMMANDS.backend.title}\n`)
            npmFrontend('build:backend')
            return
        case 'backend:standard':
            console.log(`\n▶ ${COMMANDS['backend:standard'].title}\n`)
            console.log('说明：标准版后端胖包 — 排除 AI / lineage / metadoc / datagen / sync / backup。\n')
            mvn(
                '-pl',
                'datawise-server',
                '-am',
                'package',
                '-DskipTests',
                '-Pstandard,ops-extras',
                `-Dspring-boot.excludes=${STANDARD_EXCLUDES}`,
            )
            return
        case 'plugins':
            console.log(`\n▶ ${COMMANDS.plugins.title}\n`)
            // 连接器聚合工程：package 后由 antrun 拷到 config/plugins/
            mvn('-pl', 'datawise-connectors', '-am', 'package', '-DskipTests', '-Dmaven.test.skip=true')
            return
        case 'dist':
            console.log(`\n▶ ${COMMANDS.dist.title}\n`)
            printDistHint()
            npmFrontendWithArgs('dist:desktop', extra)
            return
        case 'dist:slim':
            console.log(`\n▶ ${COMMANDS['dist:slim'].title}\n`)
            printDistHint()
            npmFrontendWithArgs('dist:desktop:slim', extra)
            return
        case 'dist:full':
            console.log(`\n▶ ${COMMANDS['dist:full'].title}\n`)
            printDistHint()
            npmFrontendWithArgs('dist:desktop:full', extra)
            return
        case 'dist:publish':
            console.log(`\n▶ ${COMMANDS['dist:publish'].title}\n`)
            printDistHint()
            npmFrontendWithArgs('dist:desktop:publish', extra)
            return
        case 'dev':
            console.log(`\n▶ ${COMMANDS.dev.title}\n`)
            npmFrontendWithArgs('dev:all', extra)
            return
        case 'dev:standard':
            console.log(`\n▶ ${COMMANDS['dev:standard'].title}\n`)
            console.log(
                '说明：前端按标准版编译（VITE_DATAWISE_EDITION=standard）；' +
                    '桌面同 JVM 后端仍是本机全量依赖。要验剥离胖包请另跑 npm run backend:standard。\n',
            )
            npmFrontendWithArgs('dev:all:standard', extra)
            return
        case 'stop':
            console.log(`\n▶ ${COMMANDS.stop.title}\n`)
            npmFrontend('stop:dev')
            return
        case 'smoke:community-plugin':
            console.log(`\n▶ ${COMMANDS['smoke:community-plugin'].title}\n`)
            run(process.execPath, [join(root, 'scripts/smoke-community-plugin.mjs')], root)
            return
        case 'plugin':
            console.log(`\n▶ ${COMMANDS.plugin.title}\n`)
            run(process.execPath, [join(root, 'scripts/datawise-plugin.mjs'), ...extra], root)
            return
        case 'all':
            console.log(`\n▶ ${COMMANDS.all.title}\n`)
            npmFrontend('clean:desktop')
            npmFrontend('build:backend')
            mvn('-pl', 'datawise-connectors', '-am', 'package', '-DskipTests', '-Dmaven.test.skip=true')
            npmFrontend('build:desktop')
            npmFrontendWithArgs('dist:desktop', extra)
            return
        default:
            console.error(`未知命令: ${cmd}\n`)
            printHelp()
            process.exit(1)
    }
}

await main()

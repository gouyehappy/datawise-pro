export type Locale = 'zh' | 'en'

export type FeatureBlock = {
  id: string
  title: string
  body: string
  image: string
  imageAlt: string
  reverse?: boolean
}

export type StartPath = {
  title: string
  body: string
  href: string
  linkLabel: string
}

export type Dictionary = {
  metaTitle: string
  metaDescription: string
  nav: {
    features: string
    connectors: string
    start: string
    docs: string
    github: string
    download: string
    langSwitch: string
    menuOpen: string
    menuClose: string
  }
  hero: {
    brand: string
    tagline: string
    support: string
    ctaPrimary: string
    ctaSecondary: string
    imageAlt: string
  }
  statement: string
  journey: {
    heading: string
    steps: Array<{label: string; hint: string}>
  }
  featuresHeading: string
  featuresSub: string
  featuresLabel: string
  features: FeatureBlock[]
  connectors: {
    label: string
    heading: string
    body: string
    names: string[]
  }
  start: {
    label: string
    heading: string
    body: string
    paths: StartPath[]
  }
  footer: {
    license: string
    docs: string
    issues: string
    rights: string
  }
}

/** Prefer VITE_GITHUB_REPO=owner/name; falls back to placeholder for local preview. */
const GH_SLUG = (import.meta.env.VITE_GITHUB_REPO as string | undefined)?.trim() || 'gouyehappy/datawise-cli'
const GH = `https://github.com/${GH_SLUG}`
const RELEASES = `${GH}/releases`
/** Same-origin docs site (resolved with Vite base in content.assetUrl). */
const DOCS = 'docs/'
const ISSUES = `${GH}/issues`

export const LINKS = {GH, RELEASES, DOCS, ISSUES} as const

export const dictionaries: Record<Locale, Dictionary> = {
  zh: {
    metaTitle: 'DataWise — AI 驱动的团队数据工作台',
    metaDescription:
      '连接数据库与数据湖，写可治理的 SQL，用流式 AI 把问题变成洞察。浏览器、桌面端与 IDE 智能体，一处到位。',
    nav: {
      features: '能力',
      connectors: '数据源',
      start: '开始使用',
      docs: '说明书',
      github: 'GitHub',
      download: '下载',
      langSwitch: 'EN',
      menuOpen: '打开菜单',
      menuClose: '关闭菜单',
    },
    hero: {
      brand: 'DataWise',
      tagline: '把数据工作，做成一件事',
      support: 'core 开箱连 MySQL / PG / SQLite，其它类型市场一键热装；团队治理写进同一工作台。',
      ctaPrimary: '获取桌面版',
      ctaSecondary: '阅读说明书',
      imageAlt: 'DataWise SQL 控制台界面',
    },
    statement: 'core 开箱 · 按需热装 · 团队治理。约 41 个数据源，一套工作流。',
    journey: {
      heading: '一条完整工作流',
      steps: [
        {label: '连接', hint: '资源树与多源接入'},
        {label: '查询', hint: 'SQL 控制台与结果网格'},
        {label: '治理', hint: '权限、审批与环境标签'},
        {label: '洞察', hint: '流式 AI 与分析画布'},
      ],
    },
    featuresHeading: '不只是数据库客户端',
    featuresSub: '从连接到洞察，同一工作台完成探索、治理与分析。',
    featuresLabel: '产品能力',
    features: [
      {
        id: 'ai',
        title: '流式 AI，带着表上下文说话',
        body: '选表对话、Text-to-SQL、流式分析与报告画布。语义指标目录可从 Schema 生成，知识库接入业务语境。',
        image: 'screenshots/04-ai-analysis.png',
        imageAlt: 'AI 分析工作台',
      },
      {
        id: 'sql',
        title: 'Explorer + SQL 控制台',
        body: '统一资源树浏览连接与库表；Monaco 编辑、结果网格、执行计划、历史书签与可视化构建。方言补全、外键 JOIN 片段开箱即用。',
        image: 'screenshots/02-explorer.png',
        imageAlt: '资源树与工作区',
        reverse: true,
      },
      {
        id: 'gov',
        title: '团队治理写进工作流',
        body: '共享连接支持只读 / 读写 / DDL；Query Library、生产审批、危险写操作审查，加上审计与开发 / 预发 / 生产环境标签。',
        image: 'screenshots/10-platform-canvas.png',
        imageAlt: '分析画布与平台能力',
      },
      {
        id: 'everywhere',
        title: '数据在哪，工作台就在哪',
        body: '浏览器本地开发、Windows / macOS / Linux 桌面一体包，或通过 MCP 接入 Cursor / Claude，VS Code 深链打开桌面控制台。',
        image: 'screenshots/01-dashboard.png',
        imageAlt: 'DataWise 仪表盘',
        reverse: true,
      },
    ],
    connectors: {
      label: '连接器',
      heading: 'core 开箱，其余一键热装',
      body: 'Releases 默认 core：预置 MySQL / PostgreSQL / SQLite。其它类型在连接器市场安装 JAR（SHA256 校验），无需重启即可热加载。slim 为最小包；full 仅离线/内网场景。',
      names: [
        'MySQL',
        'PostgreSQL',
        'Oracle',
        'SQL Server',
        'ClickHouse',
        'Doris',
        'StarRocks',
        'Hive',
        'Flink',
        'Kafka',
        'Redis',
        'MongoDB',
        '达梦',
        '人大金仓',
        'GaussDB',
        'OceanBase',
        'TiDB',
        'Trino',
        'Elasticsearch',
        '更多…',
      ],
    },
    start: {
      label: '下一步',
      heading: '选一个入口开始',
      body: '桌面安装、说明书或 IDE 智能体 — 完整操作步骤都在站内手册。',
      paths: [
        {
          title: '桌面版（core）',
          body: 'GitHub Releases 默认 core：MySQL / PG / SQLite 开箱；其它库热装。',
          href: RELEASES,
          linkLabel: '下载 Releases',
        },
        {
          title: '使用说明书',
          body: '安装、连接、Query Library、团队治理与排错的官方手册。',
          href: DOCS,
          linkLabel: '阅读手册',
        },
        {
          title: 'IDE 智能体',
          body: 'MCP 工具接入 Cursor / Claude Desktop。',
          href: `${GH}/tree/main/datawise-mcp`,
          linkLabel: '查看 MCP',
        },
      ],
    },
    footer: {
      license: 'Apache 2.0',
      docs: '使用说明书',
      issues: '反馈问题',
      rights: '开源团队数据工作台',
    },
  },
  en: {
    metaTitle: 'DataWise — AI-native team data workbench',
    metaDescription:
      'Connect databases and lakes, write governed SQL, and turn questions into insights with streaming AI — in the browser, desktop, or your IDE.',
    nav: {
      features: 'Capabilities',
      connectors: 'Sources',
      start: 'Get started',
      docs: 'Manual',
      github: 'GitHub',
      download: 'Download',
      langSwitch: '中文',
      menuOpen: 'Open menu',
      menuClose: 'Close menu',
    },
    hero: {
      brand: 'DataWise',
      tagline: 'One workbench for the whole data loop',
      support: 'Core ships MySQL / Postgres / SQLite; install other connectors on demand. Team governance stays in the same workbench.',
      ctaPrimary: 'Get desktop',
      ctaSecondary: 'Read the manual',
      imageAlt: 'DataWise SQL console',
    },
    statement: 'Core out of the box · hot-load on demand · team governance. ~41 sources, one workflow.',
    journey: {
      heading: 'One continuous workflow',
      steps: [
        {label: 'Connect', hint: 'Explorer and multi-source access'},
        {label: 'Query', hint: 'SQL console and result grid'},
        {label: 'Govern', hint: 'Permissions, approval, env labels'},
        {label: 'Insight', hint: 'Streaming AI and canvases'},
      ],
    },
    featuresHeading: 'More than a SQL client',
    featuresSub: 'From connection to insight — explore, govern, and analyze in one workbench.',
    featuresLabel: 'Capabilities',

    features: [
      {
        id: 'ai',
        title: 'Streaming AI with table context',
        body: 'Table-scoped chat, Text-to-SQL, streaming analysis, and report canvases. Semantic metrics catalogs — including schema-driven generation — plus RAG hooks for domain context.',
        image: 'screenshots/04-ai-analysis.png',
        imageAlt: 'AI analysis workbench',
      },
      {
        id: 'sql',
        title: 'Explorer + SQL console',
        body: 'Unified tree for connections and schemas; Monaco editor, result grid, plans, history, bookmarks, and VQB. Dialect-aware completion and FK JOIN helpers out of the box.',
        image: 'screenshots/02-explorer.png',
        imageAlt: 'Explorer and workspace',
        reverse: true,
      },
      {
        id: 'gov',
        title: 'Governance in the workflow',
        body: 'Shared connections with read / read-write / DDL levels; query library, production approval, review before risky writes, audit trails, and env labels.',
        image: 'screenshots/10-platform-canvas.png',
        imageAlt: 'Analysis canvas and platform',
      },
      {
        id: 'everywhere',
        title: 'Everywhere your data lives',
        body: 'Browser for local dev, all-in-one desktop for Windows / macOS / Linux, MCP for Cursor / Claude, and VS Code deep links into the desktop console.',
        image: 'screenshots/01-dashboard.png',
        imageAlt: 'DataWise dashboard',
        reverse: true,
      },
    ],
    connectors: {
      label: 'Connectors',
      heading: 'Core out of the box; hot-load the rest',
      body: 'Releases default to core: MySQL, PostgreSQL, and SQLite. Install other JARs from the connector market (SHA256-verified) without restart. slim is the minimal SKU; full is for offline / air-gapped installs only.',
      names: [
        'MySQL',
        'PostgreSQL',
        'Oracle',
        'SQL Server',
        'ClickHouse',
        'Doris',
        'StarRocks',
        'Hive',
        'Flink',
        'Kafka',
        'Redis',
        'MongoDB',
        'Dameng',
        'Kingbase',
        'GaussDB',
        'OceanBase',
        'TiDB',
        'Trino',
        'Elasticsearch',
        'and more…',
      ],
    },
    start: {
      label: 'Next step',
      heading: 'Pick a way in',
      body: 'Desktop installer, the user manual, or IDE agents — full steps live in the Chinese manual on this site.',
      paths: [
        {
          title: 'Desktop (core)',
          body: 'GitHub Releases ship core by default — MySQL / PG / SQLite ready; hot-load the rest.',
          href: RELEASES,
          linkLabel: 'Download releases',
        },
        {
          title: 'User manual',
          body: 'Install, connections, Query Library, team governance, and troubleshooting (Chinese).',
          href: DOCS,
          linkLabel: 'Read the docs',
        },
        {
          title: 'IDE agents',
          body: 'MCP tools for Cursor / Claude Desktop.',
          href: `${GH}/tree/main/datawise-mcp`,
          linkLabel: 'Explore MCP',
        },
      ],
    },
    footer: {
      license: 'Apache 2.0',
      docs: 'User manual',
      issues: 'Report issues',
      rights: 'Open-source team data workbench',
    },
  },
}

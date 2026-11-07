/**
 * Guardrail: forbid ambient shells, parallel button families, naked input classes,
 * and hardcoded *control-box* heights outside the density token layer.
 * Soft-warns on business hex colors (P2C-6) unless AUDIT_UI_STYLE_HEX=error.
 *
 *   npm run audit:ui-style --prefix datawise-frontend
 */
import {readdirSync, readFileSync, statSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const HEX_MODE = (process.env.AUDIT_UI_STYLE_HEX || 'error').toLowerCase()

const FORBIDDEN = [
    {
        id: 'ambient-class',
        pattern: /module-page--ambient/,
        message: 'Do not use module-page--ambient; classic/ide skins own chrome.',
    },
    {
        id: 'hero-glow',
        pattern: /mp-hero--glow|mp-hero__glow/,
        message: 'Do not add hero glow orbs; keep flat tool UI.',
    },
    {
        id: 'mp-btn-class',
        pattern: /\.mp-btn\b|class=(["'])[^"']*\bmp-btn\b/,
        message: 'Do not use .mp-btn; use DwButton / btn-*.',
    },
    {
        id: 'mp-segment-class',
        pattern: /\.mp-segment\b|mp-segment--|class=(["'])[^"']*\bmp-segment\b/,
        message: 'Do not use .mp-segment; use .dw-segment / .dw-segment--wrap.',
    },
    {
        id: 'dw-control-height-typo',
        pattern: /--dw-control-height\b/,
        message: 'Use --dw-control-h (density alias), not --dw-control-height.',
    },
]

/** Naked input class on business templates — prefer DwInput / DwSecretInput (P3-5). */
const NAKED_INPUT = [
    {
        id: 'naked-dw-input',
        pattern: /<(?:input|textarea)\b[^>]*\bclass=(["'])[^"']*\bdw-input\b/,
        message: 'Do not use naked class="dw-input" on <input>/<textarea>; use DwInput / DwSecretInput.',
    },
    {
        id: 'naked-mp-input',
        pattern: /<(?:input|textarea)\b[^>]*\bclass=(["'])[^"']*\bmp-input\b/,
        message: 'Do not use naked class="mp-input"; use DwInput (layout class via attrs if needed).',
    },
]

/** Paths allowed to define / apply dw-input class (component internals + form tokens). */
const NAKED_INPUT_ALLOW = [
    /^core\/components\/ui\/DwInput\.vue$/,
    /^core\/components\/ui\/DwSecretInput\.vue$/,
    /^core\/components\/ui\/TableCellInput\.vue$/,
    /^styles\/forms\.css$/,
]

/**
 * Naked mp-card root on business templates — prefer DwCard panel.
 * Allows BEM (`mp-card__*`) and compounds (`mp-card-row` / `mp-card-grid`).
 */
const NAKED_MP_CARD = {
    id: 'naked-mp-card',
    pattern: /<[a-zA-Z][\w-]*\b[^>]*\bclass=(["'])[^"']*\bmp-card(?![-_])\b/,
    message: 'Do not hand-write class="mp-card" root; use DwCard (variant=panel).',
}

const NAKED_MP_CARD_ALLOW = [/^core\/components\/ui\/DwCard\.vue$/]

/** Chrome height tokens must not hardcode px outside variables/skins. */
const CHROME_TOKEN_PX = [
    {
        id: 'chrome-token-px',
        pattern:
            /--dw-(?:wb-head-min-height|titlebar-height|tab-height|tab-pill-height|toolbar-height|status-height)\s*:\s*[^;]*\d+px/,
        message:
            'Define chrome height tokens (--dw-wb-head-min-height / titlebar / tab / toolbar / status) only in variables.css or skins/*.',
    },
]

/** Paths allowed to define density / skin px values. */
const DENSITY_DEFINE_ALLOW = [/^styles\/variables\.css$/, /^styles\/skins\//]

/**
 * Skip decorative / content / graph files for control-height scan.
 */
const HEIGHT_FILE_ALLOW = [
    /^styles\/variables\.css$/,
    /^styles\/skins\//,
    /^app\/components\/AppSplash\.vue$/,
    /^features\/onboarding\//,
    /^features\/settings\/components\/ThemeSkinCard\.vue$/,
    /^features\/settings\/components\/ThemeAppearanceCard\.vue$/,
    /^features\/settings\/components\/LayoutToggleChip\.vue$/,
    /^features\/layout\/components\/AppBrandLogo\.vue$/,
    /^shared\/charts\//,
    /^core\/components\/DwCodeViewer\.vue$/,
    /^core\/components\/DwLogViewer\.vue$/,
    /dw-graph/,
    /SchemaEr/,
    /VisualQueryCanvas/,
    /FlowNode/,
    /EchartsPanel/,
    /DashboardSavedChart/,
    /SaveChartToDashboard/,
]

/**
 * Hex / rgb soft-warn allowlist (P2C-6 / 附录 D).
 * color-exception paths: terminal palette, charts, graph nodes, theme previews, tokens.
 */
const HEX_FILE_ALLOW = [
    /^styles\/variables\.css$/,
    /^styles\/skins\//,
    /^styles\/tones\.css$/,
    /^styles\/forms\.css$/,
    /^styles\/modals\.css$/,
    /^styles\/context-menu\.css$/,
    /^styles\/editor-minimap\.css$/,
    /^styles\/migration-wizard\.css$/,
    /^styles\/settings\//,
    /^features\/terminal\//,
    /^shared\/charts\//,
    /^core\/graph-canvas\//,
    /^core\/components\/DwCodeViewer\.vue$/,
    /^core\/components\/DwLogViewer\.vue$/,
    /^core\/components\/DwInlineAlert\.vue$/,
    /dw-graph/,
    /SchemaEr/,
    /LineageEntityFlowNode/,
    /LineageColumnMapView/,
    /EchartsPanel/,
    /ThemeSkinCard/,
    /ThemeAppearanceCard/,
    /LayoutToggleChip/,
    /LayoutWorkbenchPreview/,
    /PackFeatureStub/,
    /AppSplash/,
    /AppBrandLogo/,
    /^features\/onboarding\//,
    /K8sExecPane/,
]

const HEX_LITERAL_RE =
    /(?<![\w-])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\(\s*\d+/g

const CONTROL_HEIGHT_RE =
    /(?<![-\w])(min-)?height\s*:\s*(clamp\([^;]*?\d+px[^;]*?\)|([1-9]\d*)px)\s*;/g

/**
 * Control-box range ≈ density ladder (md/sm/xs/lg). Below = glyphs/dots;
 * at/above 64 = content/scroll/hero regions.
 */
function isControlSized(value) {
    if (/vh|vw|%|svh|dvh/.test(value)) return false
    const nums = [...value.matchAll(/(\d+)px/g)].map((m) => Number(m[1]))
    if (!nums.length) return false
    if (nums.every((n) => n <= 22)) return false
    if (nums.some((n) => n >= 64)) return false
    return nums.some((n) => n >= 23 && n <= 56)
}

function stripCssNoise(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Strip script/style for template-only naked-input scan on .vue */
function extractTemplate(text) {
    const m = text.match(/<template\b[^>]*>([\s\S]*?)<\/template>/i)
    return m ? m[1] : text
}

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue
        const full = join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) walk(full, out)
        else if (/\.(vue|css|scss)$/.test(name)) out.push(full)
    }
    return out
}

function extractStyleBlocks(rel, text) {
    if (rel.endsWith('.css') || rel.endsWith('.scss')) return [text]
    const blocks = []
    const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
    let m
    while ((m = re.exec(text))) blocks.push(m[1])
    return blocks
}

function hasColorExceptionComment(text) {
    return /color-exception\s*:/i.test(text)
}

const files = walk(ROOT)
const errors = []
const warnings = []

for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const rel = relative(ROOT, file).replace(/\\/g, '/')

    for (const rule of FORBIDDEN) {
        if (rule.pattern.test(text)) {
            errors.push(`${rel}: ${rule.message} (${rule.id})`)
        }
    }

    if (!NAKED_INPUT_ALLOW.some((re) => re.test(rel))) {
        const scan = rel.endsWith('.vue') ? extractTemplate(text) : text
        for (const rule of NAKED_INPUT) {
            if (rule.pattern.test(scan)) {
                errors.push(`${rel}: ${rule.message} (${rule.id})`)
            }
        }
    }

    if (rel.endsWith('.vue') && !NAKED_MP_CARD_ALLOW.some((re) => re.test(rel))) {
        const scan = extractTemplate(text)
        if (NAKED_MP_CARD.pattern.test(scan)) {
            errors.push(`${rel}: ${NAKED_MP_CARD.message} (${NAKED_MP_CARD.id})`)
        }
    }

    if (!DENSITY_DEFINE_ALLOW.some((re) => re.test(rel))) {
        for (const rule of CHROME_TOKEN_PX) {
            if (rule.pattern.test(text)) {
                errors.push(`${rel}: ${rule.message} (${rule.id})`)
            }
        }
    }

    if (
        /--dw-density-(md|sm|xs|lg|xl)\s*:/.test(text) &&
        !DENSITY_DEFINE_ALLOW.some((re) => re.test(rel))
    ) {
        errors.push(
            `${rel}: define --dw-density-* only in variables.css / skins/* (density-define-outside-tokens)`,
        )
    }

    if (
        !HEX_FILE_ALLOW.some((re) => re.test(rel)) &&
        !hasColorExceptionComment(text)
    ) {
        const styleParts = extractStyleBlocks(rel, text)
        for (const block of styleParts) {
            const cleaned = stripCssNoise(block)
            HEX_LITERAL_RE.lastIndex = 0
            if (HEX_LITERAL_RE.test(cleaned)) {
                const msg = `${rel}: prefer --dw-* / --mp-* tokens over bare hex/rgb (hardcoded-color); mark // color-exception: … if intentional`
                if (HEX_MODE === 'error') errors.push(`${msg} (hardcoded-color)`)
                else warnings.push(`${msg} (hardcoded-color)`)
                break
            }
        }
    }

    if (HEIGHT_FILE_ALLOW.some((re) => re.test(rel))) continue

    for (const block of extractStyleBlocks(rel, text)) {
        const cleaned = stripCssNoise(block)
        CONTROL_HEIGHT_RE.lastIndex = 0
        let m
        while ((m = CONTROL_HEIGHT_RE.exec(cleaned))) {
            const prop = m[1] ? 'min-height' : 'height'
            const value = m[2]
            if (!isControlSized(value)) continue
            errors.push(
                `${rel}: hardcoded ${prop}: ${value} — use --dw-density-{md,sm,xs,lg,xl} / --dw-control-h* (hardcoded-control-height)`,
            )
        }
    }
}

for (const e of errors) console.error(`[error] ${e}`)
for (const w of warnings) console.warn(`[warn] ${w}`)

if (errors.length) {
    console.error(`\naudit:ui-style failed (${errors.length} error(s), ${warnings.length} warning(s))`)
    process.exit(1)
}

console.log(
    `audit:ui-style ok (${files.length} files, ${warnings.length} color warning(s); HEX mode=${HEX_MODE})`,
)

/**
 * 首屏同步主题（在 Vite 模块加载前执行）。
 * 逻辑与 theme.service.ts 保持同步。
 */
;(function () {
    var THEME_KEY = 'dw-cli-theme-prefs'
    var CONFIG_KEY = 'dw-app-config'

    var PRIMARY = {
        violet: {primary: '#7c3aed', hover: '#6d28d9'},
        blue: {primary: '#2563eb', hover: '#1d4ed8'},
        cyan: {primary: '#0891b2', hover: '#0e7490'},
        green: {primary: '#16a34a', hover: '#15803d'},
        orange: {primary: '#ea580c', hover: '#c2410c'},
        rose: {primary: '#e11d48', hover: '#be123c'},
    }

    var BG_LIGHT = {
        default: {bg: '#ffffff', muted: '#f8f9fb', panel: '#fafbfc', hover: '#f3f4f6', rail: '#f5f6f8'},
        warm: {bg: '#faf9f7', muted: '#f5f3ef', panel: '#f7f5f1', hover: '#ede9e3', rail: '#f0ece6'},
        cool: {bg: '#f8fafc', muted: '#f1f5f9', panel: '#f4f7fb', hover: '#e8eef5', rail: '#eef2f7'},
        slate: {bg: '#f4f6f8', muted: '#eceff3', panel: '#f0f2f5', hover: '#e2e6eb', rail: '#e8ebef'},
    }

    /* Keep in sync with @datawise/theme — 中间略淡、四周加重 */
    var BG_DARK = {
        default: {bg: '#1a1b1e', muted: '#222326', panel: '#1e1f22', hover: '#323438', rail: '#2b2d30'},
        warm: {bg: '#1a1816', muted: '#221f1c', panel: '#1e1c19', hover: '#34302c', rail: '#2a2724'},
        cool: {bg: '#1a1b1e', muted: '#222326', panel: '#1e1f22', hover: '#323438', rail: '#2b2d30'},
        slate: {bg: '#181a1f', muted: '#21242a', panel: '#1c1e24', hover: '#32363e', rail: '#2a2d33'},
    }

    var DARK_UI = {
        border: 'rgba(255, 255, 255, 0.08)',
        borderLight: 'rgba(255, 255, 255, 0.08)',
        panelBorder: 'rgba(255, 255, 255, 0.08)',
        panelShadow: '0 1px 2px rgba(0, 0, 0, 0.14)',
        text: '#f0f0f3',
        textSecondary: '#d4d4d8',
        textMuted: '#c4c7cc',
        textDim: '#a8adb6',
        tabBarBg: '#1a1b1e',
        tabBarBorder: 'rgba(255, 255, 255, 0.08)',
        tabActiveBg: '#2b2d30',
        tabActiveBorder: 'transparent',
        tabActiveText: '#f4f4f7',
        tabInactiveText: '#c8c8d0',
        tabHoverBg: 'rgba(255, 255, 255, 0.08)',
        tabCloseHover: 'rgba(255, 255, 255, 0.12)',
        toolPillActive: 'color-mix(in srgb, #fff 10%, var(--dw-bg-rail))',
        shadow: '0 8px 24px rgba(0, 0, 0, 0.32)',
        menuShadow:
            '0 1px 2px rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.24), 0 16px 40px rgba(0, 0, 0, 0.32)',
    }

    var LIGHT_UI = {
        border: '#e2e8f0',
        borderLight: 'rgba(15, 23, 42, 0.08)',
        panelBorder: 'rgba(15, 23, 42, 0.08)',
        panelShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        text: '#111827',
        textSecondary: '#6b7280',
        textMuted: '#9ca3af',
        textDim: '#808080',
        chrome: '#dce4ee',
        tabBarBg: '#dce3ea',
        tabBarBorder: '#c5cdd8',
        tabActiveBg: '#ffffff',
        tabActiveBorder: '#2563eb',
        tabActiveText: '#1f2937',
        tabInactiveText: '#6b7280',
        tabHoverBg: 'rgba(0, 0, 0, 0.08)',
        tabCloseHover: 'rgba(0, 0, 0, 0.08)',
        shadow: '0 8px 24px rgba(15, 23, 42, 0.1)',
        menuShadow:
            '0 1px 2px rgba(15, 23, 42, 0.04), 0 4px 12px rgba(15, 23, 42, 0.06), 0 16px 40px rgba(15, 23, 42, 0.1)',
    }

    /* Keep in sync with theme-presets.ts UI_FONT_STACKS */
    var UI_FONT_STACKS = {
        geist:
            "'Geist Variable', 'Geist', 'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
        noto:
            "'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Source Han Sans SC', 'HarmonyOS Sans SC', system-ui, sans-serif",
        system:
            "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif",
        segoe:
            "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
        yahei:
            "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif",
        pingfang:
            "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif",
        sourceHan:
            "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
        harmony:
            "'HarmonyOS Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    }
    var SYSTEM_FALLBACK =
        "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    var BODY_PX = {sm: 12, md: 13.5, lg: 15}
    var BODY_PX_MD = 13.5
    var BODY_PX_MIN = 11
    var BODY_PX_MAX = 18

    function withAlpha(hex, alpha) {
        var value = hex.replace('#', '')
        if (value.length === 3) {
            value = value
                .split('')
                .map(function (c) {
                    return c + c
                })
                .join('')
        }
        var r = parseInt(value.slice(0, 2), 16)
        var g = parseInt(value.slice(2, 4), 16)
        var b = parseInt(value.slice(4, 6), 16)
        return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')'
    }

    function readAppearance(parsed) {
        if (parsed.appearance === 'light' || parsed.appearance === 'dark' || parsed.appearance === 'system') {
            return parsed.appearance
        }
        if (parsed.mode === 'dark') return 'dark'
        return 'light'
    }

    function readUiSkin(value) {
        return value === 'ide' || value === 'classic' || value === 'atelier' || value === 'ledger'
            ? value
            : 'classic'
    }

    function readUiFont(value) {
        if (value === 'custom') return 'custom'
        return UI_FONT_STACKS[value] ? value : 'geist'
    }

    function readUiTextScale(value) {
        return value === 'sm' || value === 'md' || value === 'lg' || value === 'custom'
            ? value
            : 'md'
    }

    function readUiDensity(value) {
        return value === 'sm' || value === 'md' || value === 'lg' ? value : 'md'
    }

    function sanitizeFontCustom(value) {
        if (typeof value !== 'string') return ''
        return value.replace(/['";{}\\]/g, '').trim().slice(0, 64)
    }

    function clampBodyPx(value) {
        var n = typeof value === 'number' ? value : parseFloat(value)
        if (!isFinite(n)) return BODY_PX_MD
        var stepped = Math.round(n * 2) / 2
        return Math.min(BODY_PX_MAX, Math.max(BODY_PX_MIN, stepped))
    }

    function resolveFontStack(uiFont, uiFontCustom) {
        if (uiFont === 'custom') {
            var name = sanitizeFontCustom(uiFontCustom)
            if (!name) return UI_FONT_STACKS.system
            var quoted = name.indexOf(' ') >= 0 ? "'" + name + "'" : name
            return quoted + ', ' + SYSTEM_FALLBACK
        }
        return UI_FONT_STACKS[uiFont] || UI_FONT_STACKS.geist
    }

    function resolveBodyPx(prefs) {
        if (prefs.uiTextScale === 'custom') return clampBodyPx(prefs.uiFontSizePx)
        return BODY_PX[prefs.uiTextScale] || BODY_PX_MD
    }

    function readPrefs() {
        try {
            var raw = localStorage.getItem(THEME_KEY)
            if (raw) {
                var parsed = JSON.parse(raw)
                return {
                    appearance: readAppearance(parsed),
                    background: parsed.background || 'cool',
                    primary: parsed.primary || 'blue',
                    uiSkin: readUiSkin(parsed.uiSkin),
                    uiFont: readUiFont(parsed.uiFont),
                    uiFontCustom: sanitizeFontCustom(parsed.uiFontCustom),
                    uiTextScale: readUiTextScale(parsed.uiTextScale),
                    uiFontSizePx: clampBodyPx(parsed.uiFontSizePx),
                    uiDensity: readUiDensity(parsed.uiDensity),
                    coloredToolbarIcons: parsed.iconToneV2 === true && parsed.coloredToolbarIcons === true,
                }
            }
            var configRaw = localStorage.getItem(CONFIG_KEY)
            if (configRaw) {
                var config = JSON.parse(configRaw)
                if (config.theme) {
                    return {
                        appearance: readAppearance(config.theme),
                        background: config.theme.background || 'cool',
                        primary: config.theme.primary || 'blue',
                        uiSkin: readUiSkin(config.theme.uiSkin),
                        uiFont: readUiFont(config.theme.uiFont),
                        uiFontCustom: sanitizeFontCustom(config.theme.uiFontCustom),
                        uiTextScale: readUiTextScale(config.theme.uiTextScale),
                        uiFontSizePx: clampBodyPx(config.theme.uiFontSizePx),
                        uiDensity: readUiDensity(config.theme.uiDensity),
                        coloredToolbarIcons: config.theme.iconToneV2 === true && config.theme.coloredToolbarIcons === true,
                    }
                }
            }
        } catch (e) {
            /* fall through */
        }
        return {
            appearance: 'system',
            background: 'cool',
            primary: 'blue',
            uiSkin: 'classic',
            uiFont: 'geist',
            uiFontCustom: '',
            uiTextScale: 'md',
            uiFontSizePx: BODY_PX_MD,
            uiDensity: 'md',
            coloredToolbarIcons: false,
        }
    }

    function resolveMode(appearance) {
        if (appearance === 'system') {
            // Prefer host-resolved mode (Java SystemThemeUtil) over matchMedia — JCEF often disagrees.
            if (window.__DW_HOST_THEME_MODE__ === 'dark' || window.__DW_HOST_THEME_MODE__ === 'light') {
                return window.__DW_HOST_THEME_MODE__
            }
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return appearance
    }

    function apply(mode, prefs, force) {
        var root = document.documentElement
        var primary = PRIMARY[prefs.primary] || PRIMARY.blue
        var surfaces =
            mode === 'dark'
                ? BG_DARK[prefs.background] || BG_DARK.cool
                : BG_LIGHT[prefs.background] || BG_LIGHT.cool
        var ui = mode === 'dark' ? DARK_UI : LIGHT_UI

        var skin = prefs.uiSkin || 'classic'
        var uiFont = readUiFont(prefs.uiFont)
        var uiTextScale = readUiTextScale(prefs.uiTextScale)
        var uiDensity = readUiDensity(prefs.uiDensity)
        var iconTones = prefs.coloredToolbarIcons === true ? 'on' : 'off'
        var bodyPx = resolveBodyPx({
            uiTextScale: uiTextScale,
            uiFontSizePx: prefs.uiFontSizePx,
        })
        var scaleFactor = bodyPx / BODY_PX_MD
        root.setAttribute('data-theme', mode)
        root.setAttribute('data-bg-tone', prefs.background)
        root.setAttribute('data-ui-skin', skin)
        root.setAttribute('data-ui-font', uiFont)
        root.setAttribute('data-ui-text-scale', uiTextScale)
        root.setAttribute('data-ui-density', uiDensity)
        root.setAttribute('data-icon-tones', iconTones)
        if (uiTextScale === 'custom') {
            root.setAttribute('data-ui-font-size-px', String(bodyPx))
        } else {
            root.removeAttribute('data-ui-font-size-px')
        }
        root.style.colorScheme = mode
        root.style.setProperty('--dw-font', resolveFontStack(uiFont, prefs.uiFontCustom))
        root.style.setProperty('--dw-font-size', bodyPx + 'px')
        root.style.setProperty('--dw-ui-text-scale', String(scaleFactor))

        // Always use palette chrome so migrations are not stuck on stale host seed.
        var chrome =
            mode === 'dark' ? surfaces.rail : skin === 'ide' ? '#cfd8e6' : LIGHT_UI.chrome
        /* Keep in sync with @datawise/theme UI_SKIN_DEFINITIONS capabilities */
        var isStrip = skin === 'ide' || skin === 'ledger'
        var noPanelShadow = skin === 'ide' || skin === 'ledger'
        var pillTabBarBg = skin === 'atelier' ? surfaces.panel : ui.tabBarBg

        var vars = {
            '--dw-primary': primary.primary,
            '--dw-primary-hover': primary.hover,
            '--dw-primary-softer': withAlpha(primary.primary, mode === 'dark' ? 0.08 : 0.06),
            '--dw-primary-mild': withAlpha(primary.primary, mode === 'dark' ? 0.16 : 0.1),
            '--dw-primary-soft': withAlpha(primary.primary, mode === 'dark' ? 0.14 : 0.12),
            '--dw-primary-tint':
                mode === 'dark'
                    ? 'color-mix(in srgb, ' + primary.primary + ' 18%, var(--dw-bg-panel))'
                    : 'color-mix(in srgb, ' + primary.primary + ' 11%, var(--dw-bg))',
            '--dw-primary-border': withAlpha(primary.primary, 0.45),
            '--dw-primary-ring': withAlpha(primary.primary, mode === 'dark' ? 0.34 : 0.22),
            '--dw-bg': surfaces.bg,
            '--dw-bg-muted': surfaces.muted,
            '--dw-bg-panel': surfaces.panel,
            '--dw-bg-hover': surfaces.hover,
            '--dw-bg-rail': surfaces.rail,
            '--dw-bg-editor': surfaces.bg,
            '--dw-bg-chrome': chrome,
            '--dw-border': ui.border,
            '--dw-panel-border': ui.panelBorder,
            '--dw-panel-shadow': noPanelShadow ? 'none' : ui.panelShadow,
            '--dw-text': ui.text,
            '--dw-text-secondary': ui.textSecondary,
            '--dw-text-muted': ui.textMuted,
            '--dw-text-dim': ui.textDim,
            '--dw-tool-hover':
                mode === 'dark'
                    ? 'color-mix(in srgb, #fff 7%, transparent)'
                    : 'color-mix(in srgb, var(--dw-text) 6%, transparent)',
            '--dw-tool-active': 'color-mix(in srgb, ' + primary.primary + ' 10%, var(--dw-bg-rail))',
            '--dw-tool-pill-active':
                mode === 'dark'
                    ? DARK_UI.toolPillActive
                    : 'color-mix(in srgb, var(--dw-text) 9%, var(--dw-bg-hover))',
            '--dw-tab-bar-bg': isStrip ? surfaces.bg : pillTabBarBg,
            '--dw-tab-bar-border': isStrip ? ui.panelBorder : ui.tabBarBorder,
            '--dw-tab-active-bg': isStrip ? surfaces.bg : ui.tabActiveBg,
            '--dw-tab-active-border': isStrip ? 'transparent' : ui.tabActiveBorder,
            '--dw-tab-active-text': isStrip ? ui.text : ui.tabActiveText,
            '--dw-tab-inactive-text': ui.tabInactiveText,
            '--dw-tab-hover-bg': isStrip
                ? (mode === 'dark'
                    ? 'color-mix(in srgb, #fff 5%, transparent)'
                    : 'color-mix(in srgb, var(--dw-text) 6%, transparent)')
                : ui.tabHoverBg,
            '--dw-tab-close-hover': isStrip
                ? (mode === 'dark'
                    ? 'color-mix(in srgb, #fff 10%, transparent)'
                    : 'color-mix(in srgb, var(--dw-text) 10%, transparent)')
                : ui.tabCloseHover,
            '--dw-shadow': ui.shadow,
            '--dw-menu-shadow': ui.menuShadow,
        }

        /* Dark: force outline ladder. Light: leave outline/seam/border-light to skins. */
        if (mode === 'dark') {
            vars['--dw-border-light'] = ui.borderLight
            vars['--dw-panel-outline'] = 'rgba(255, 255, 255, 0.08)'
            vars['--dw-seam-divider'] = 'rgba(255, 255, 255, 0.08)'
        } else {
            root.style.removeProperty('--dw-border-light')
            root.style.removeProperty('--dw-panel-outline')
            root.style.removeProperty('--dw-seam-divider')
        }

        for (var name in vars) {
            if (Object.prototype.hasOwnProperty.call(vars, name)) {
                root.style.setProperty(name, vars[name])
            }
        }
        root.style.setProperty('--dw-boot-chrome', chrome)
        root.style.setProperty('--dw-bg-chrome', chrome)
        root.style.backgroundColor = chrome
        if (document.body) {
            document.body.style.backgroundColor = chrome
        }
        var cover = document.getElementById('dw-open-screen')
        if (cover) {
            cover.style.background = chrome
        }
        window.__DW_BOOT_CHROME__ = chrome
        window.__DW_HOST_CHROME__ = chrome
        root.setAttribute('data-dw-theme-boot', '1')
    }

    function boot(force) {
        var prefs = readPrefs()
        var mode = resolveMode(prefs.appearance)
        if (
            !force
            && document.documentElement.getAttribute('data-dw-theme-boot') === '1'
            && document.documentElement.getAttribute('data-theme') === mode
        ) {
            return
        }
        apply(mode, prefs, !!force)
    }

    window.__datawiseThemeBoot = boot

    try {
        boot(false)
    } catch (e) {
        var seeded = document.getElementById('dw-host-theme-seed')
        document.documentElement.setAttribute('data-theme', seeded ? 'dark' : 'light')
    }
})()

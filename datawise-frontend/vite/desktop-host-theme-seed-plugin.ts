import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {Plugin} from 'vite'

type ChromeFile = {
    appearance?: string
    background?: string
    primary?: string
    uiSkin?: string
    uiFont?: string
    uiFontCustom?: string
    uiTextScale?: string
    uiFontSizePx?: number
    uiDensity?: string
    coloredToolbarIcons?: string | boolean
    resolvedMode?: string
    chromeBg?: string
    primaryHex?: string
    locale?: string
    zoomLevel?: number
    editorFontSize?: number
    editorFontFamily?: string
}

const UI_FONT_IDS = new Set([
    'noto',
    'system',
    'segoe',
    'yahei',
    'pingfang',
    'sourceHan',
    'harmony',
    'custom',
])
const UI_TEXT_SCALE_IDS = new Set(['sm', 'md', 'lg', 'custom'])
const UI_DENSITY_IDS = new Set(['sm', 'md', 'lg'])

/** Keep in sync with theme-presets.ts / public/theme-boot.js UI_FONT_STACKS. */
const UI_FONT_STACKS = {
    noto: "'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Source Han Sans SC', 'HarmonyOS Sans SC', system-ui, sans-serif",
    system:
        "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif",
    segoe: "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif",
    yahei: "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif",
    pingfang: "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif",
    sourceHan: "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
    harmony: "'HarmonyOS Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif",
} as const
const SYSTEM_FALLBACK =
    "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
const BODY_PX: Record<string, number> = {sm: 12, md: 13.5, lg: 15}

const PRIMARY_HEX: Record<string, string> = {
    violet: '#7c3aed',
    blue: '#2563eb',
    cyan: '#0891b2',
    green: '#16a34a',
    orange: '#ea580c',
    rose: '#e11d48',
}

type RendererUi = {
    themeAppearance?: string
    themeBackground?: string
    themePrimary?: string
    themeUiSkin?: string
    themeUiFont?: string
    themeUiTextScale?: string
    themeUiDensity?: string
    appearance?: string
    background?: string
    primary?: string
    uiSkin?: string
    uiFont?: string
    uiTextScale?: string
    uiDensity?: string
}

/**
 * Dev Vite：对齐 packaged HtmlBridgeInjector —
 * 在 HTML 到达 CEF 前把本机 chrome prefs 写入 localStorage。
 */
export function desktopHostThemeSeedPlugin(): Plugin {
    return {
        name: 'desktop-host-theme-seed',
        transformIndexHtml(html) {
            const chrome = readMachineChrome()
            const background = chrome.background || 'cool'
            const mode = chrome.resolvedMode === 'dark' || chrome.resolvedMode === 'light'
                ? chrome.resolvedMode
                : resolveModeFromAppearance(chrome.appearance || 'system')
            const hostSkin = chrome.uiSkin === 'ide' ? 'ide' : chrome.uiSkin === 'classic' ? 'classic' : null
            // Keep system appearance as-is (resolved mode only for paint).
            const storedAppearance =
                chrome.appearance === 'light' || chrome.appearance === 'dark' || chrome.appearance === 'system'
                    ? chrome.appearance
                    : 'system'
            const chromeBg = chrome.chromeBg
                || (mode === 'dark' ? '#2b2d30' : '#dce4ee')
            const primaryHex =
                (typeof chrome.primaryHex === 'string' && chrome.primaryHex.startsWith('#')
                    ? chrome.primaryHex
                    : null)
                || PRIMARY_HEX[chrome.primary || '']
                || PRIMARY_HEX.blue
            const skinLiteral = hostSkin == null ? 'null' : JSON.stringify(hostSkin)

            const hostUiFont =
                typeof chrome.uiFont === 'string' && UI_FONT_IDS.has(chrome.uiFont)
                    ? chrome.uiFont
                    : null
            const uiFontLiteral = hostUiFont == null ? 'null' : JSON.stringify(hostUiFont)
            const hostUiTextScale =
                typeof chrome.uiTextScale === 'string' && UI_TEXT_SCALE_IDS.has(chrome.uiTextScale)
                    ? chrome.uiTextScale
                    : null
            const uiTextScaleLiteral = hostUiTextScale == null ? 'null' : JSON.stringify(hostUiTextScale)
            const hostUiDensity =
                typeof chrome.uiDensity === 'string' && UI_DENSITY_IDS.has(chrome.uiDensity)
                    ? chrome.uiDensity
                    : null
            const uiDensityLiteral = hostUiDensity == null ? 'null' : JSON.stringify(hostUiDensity)
            const hostColoredIcons =
                chrome.coloredToolbarIcons === false || chrome.coloredToolbarIcons === 'false'
                    ? false
                    : chrome.coloredToolbarIcons === true || chrome.coloredToolbarIcons === 'true'
                      ? true
                      : null
            const coloredIconsLiteral = hostColoredIcons == null ? 'null' : String(hostColoredIcons)

            const hostUiFontCustom =
                typeof chrome.uiFontCustom === 'string' ? chrome.uiFontCustom.replace(/['";{}\\]/g, '').trim().slice(0, 64) : ''
            const hostUiFontSizePx =
                typeof chrome.uiFontSizePx === 'number' && chrome.uiFontSizePx > 0 ? chrome.uiFontSizePx : null
            const inject = `<script id="dw-vite-host-theme-seed">(function(){try{
var seeded={appearance:${JSON.stringify(storedAppearance)},background:${JSON.stringify(background)},primary:${JSON.stringify(chrome.primary || 'blue')},uiSkin:${skinLiteral},uiFont:${uiFontLiteral},uiFontCustom:${JSON.stringify(hostUiFontCustom)},uiTextScale:${uiTextScaleLiteral},uiFontSizePx:${hostUiFontSizePx == null ? 'null' : hostUiFontSizePx},uiDensity:${uiDensityLiteral},coloredToolbarIcons:${coloredIconsLiteral}};
try{
  var prev=JSON.parse(localStorage.getItem('dw-cli-theme-prefs')||'{}');
  if(!seeded.uiSkin){seeded.uiSkin=(prev&&prev.uiSkin==='ide')?'ide':'classic';}
  if(!seeded.uiFont){
    var pf=prev&&prev.uiFont;
    seeded.uiFont=(pf==='system'||pf==='segoe'||pf==='yahei'||pf==='pingfang'||pf==='sourceHan'||pf==='harmony'||pf==='custom'||pf==='noto')?pf:'noto';
  }
  if(!seeded.uiFontCustom){seeded.uiFontCustom=(prev&&typeof prev.uiFontCustom==='string')?prev.uiFontCustom:'';}
  if(!seeded.uiTextScale){
    var ps=prev&&prev.uiTextScale;
    seeded.uiTextScale=(ps==='sm'||ps==='md'||ps==='lg'||ps==='custom')?ps:'md';
  }
  if(seeded.uiFontSizePx==null&&prev&&typeof prev.uiFontSizePx==='number'){seeded.uiFontSizePx=prev.uiFontSizePx;}
  if(!seeded.uiDensity){
    var pd=prev&&prev.uiDensity;
    seeded.uiDensity=(pd==='sm'||pd==='md'||pd==='lg')?pd:'md';
  }
  if(seeded.coloredToolbarIcons==null){
    seeded.coloredToolbarIcons=prev&&prev.iconToneV2===true&&prev.coloredToolbarIcons===true;
  }
  seeded.iconToneV2=true;
}catch(e2){
  if(!seeded.uiSkin)seeded.uiSkin='classic';
  if(!seeded.uiFont)seeded.uiFont='noto';
  if(!seeded.uiFontCustom)seeded.uiFontCustom='';
  if(!seeded.uiTextScale)seeded.uiTextScale='md';
  if(!seeded.uiDensity)seeded.uiDensity='md';
  if(seeded.coloredToolbarIcons==null)seeded.coloredToolbarIcons=false;
  seeded.iconToneV2=true;
}
localStorage.setItem('dw-cli-theme-prefs',JSON.stringify(seeded));
var chrome=${JSON.stringify(chromeBg)};
var mode=${JSON.stringify(mode)};
var primary=${JSON.stringify(primaryHex)};
window.__DW_HOST_CHROME__=chrome;
window.__DW_HOST_THEME_MODE__=mode;
window.__DW_HOST_PRIMARY__=primary;
window.__DW_BOOT_CHROME__=chrome;
var root=document.documentElement;
root.setAttribute('data-theme',mode);
root.setAttribute('data-bg-tone',${JSON.stringify(background)});
root.setAttribute('data-ui-skin',seeded.uiSkin);
root.setAttribute('data-ui-font',seeded.uiFont);
root.setAttribute('data-ui-text-scale',seeded.uiTextScale);
root.setAttribute('data-ui-density',seeded.uiDensity);
root.setAttribute('data-icon-tones',seeded.coloredToolbarIcons===true?'on':'off');
root.style.colorScheme=mode;
root.style.setProperty('--dw-boot-chrome',chrome);
root.style.setProperty('--dw-bg-chrome',chrome);
root.style.setProperty('--dw-primary',primary);
var stacks={noto:${JSON.stringify(UI_FONT_STACKS.noto)},system:${JSON.stringify(UI_FONT_STACKS.system)},segoe:${JSON.stringify(UI_FONT_STACKS.segoe)},yahei:${JSON.stringify(UI_FONT_STACKS.yahei)},pingfang:${JSON.stringify(UI_FONT_STACKS.pingfang)},sourceHan:${JSON.stringify(UI_FONT_STACKS.sourceHan)},harmony:${JSON.stringify(UI_FONT_STACKS.harmony)}};
var fallback=${JSON.stringify(SYSTEM_FALLBACK)};
var bodyPxMap=${JSON.stringify(BODY_PX)};
var fontStack=stacks[seeded.uiFont]||stacks.noto;
if(seeded.uiFont==='custom'&&seeded.uiFontCustom){
  var cn=String(seeded.uiFontCustom).replace(/['";{}\\\\]/g,'').trim();
  if(cn){fontStack=(cn.indexOf(' ')>=0?("'"+cn+"'"):cn)+', '+fallback;}
}
root.style.setProperty('--dw-font',fontStack);
var bodyPx=bodyPxMap[seeded.uiTextScale]||13.5;
if(seeded.uiTextScale==='custom'&&typeof seeded.uiFontSizePx==='number'){bodyPx=seeded.uiFontSizePx;}
root.style.setProperty('--dw-font-size',bodyPx+'px');
root.style.setProperty('--dw-ui-text-scale',String(bodyPx/13.5));
root.style.backgroundColor=chrome;
var locale=${JSON.stringify(chrome.locale === 'en-US' || chrome.locale === 'zh-CN' ? chrome.locale : null)};
if(locale){localStorage.setItem('dw-cli-locale',locale);root.lang=locale;}
var fontSize=${JSON.stringify(typeof chrome.editorFontSize === 'number' && chrome.editorFontSize > 0 ? chrome.editorFontSize : 0)};
var fontFamily=${JSON.stringify(chrome.editorFontFamily || '')};
if(fontSize>0||fontFamily){
  var ed={};
  try{ed=JSON.parse(localStorage.getItem('dw-cli-editor-settings')||'{}');}catch(e2){}
  if(fontSize>0)ed.fontSize=fontSize;
  if(fontFamily)ed.fontFamily=fontFamily;
  localStorage.setItem('dw-cli-editor-settings',JSON.stringify(ed));
}
window.__DW_HOST_ZOOM__=${JSON.stringify(typeof chrome.zoomLevel === 'number' ? chrome.zoomLevel : 0)};
}catch(e){}})();</script>`

            if (html.includes('<head>')) {
                return html.replace('<head>', `<head>${inject}`)
            }
            return inject + html
        },
    }
}

function readMachineChrome(): ChromeFile {
    for (const file of machineChromeCandidates()) {
        try {
            if (!fs.existsSync(file)) continue
            return JSON.parse(fs.readFileSync(file, 'utf8')) as ChromeFile
        } catch {
            /* try next */
        }
    }
    // Legacy / dual-write: renderer-ui.json (canonical + theme* aliases)
    const ui = readRendererUi()
    const appearance = ui.appearance || ui.themeAppearance
    const background = ui.background || ui.themeBackground
    if (!appearance && !background) return {}
    return {
        appearance,
        background,
        primary: ui.primary || ui.themePrimary,
        uiSkin: ui.uiSkin || ui.themeUiSkin,
        uiFont: ui.uiFont || ui.themeUiFont,
        uiTextScale: ui.uiTextScale || ui.themeUiTextScale,
        uiDensity: ui.uiDensity || ui.themeUiDensity,
        coloredToolbarIcons: ui.coloredToolbarIcons,
    }
}

function machineChromeCandidates(): string[] {
    const override = process.env.DATAWISE_MACHINE_DATA?.trim()
    const userOverride = process.env.DATAWISE_USER_DATA?.trim()
    return [
        override ? path.join(override, 'desktop-chrome.json') : null,
        process.platform === 'win32' && process.env.ProgramData
            ? path.join(process.env.ProgramData, 'DataWiseCLI', 'desktop-chrome.json')
            : null,
        process.platform === 'win32' && process.env.PROGRAMDATA
            ? path.join(process.env.PROGRAMDATA, 'DataWiseCLI', 'desktop-chrome.json')
            : null,
        process.platform === 'darwin'
            ? path.join('/Library/Application Support', 'DataWiseCLI', 'desktop-chrome.json')
            : null,
        userOverride ? path.join(userOverride, 'desktop-chrome.json') : null,
        process.platform === 'win32' && process.env.APPDATA
            ? path.join(process.env.APPDATA, 'DataWiseCLI', 'desktop-chrome.json')
            : null,
        process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'DataWiseCLI', 'desktop-chrome.json')
            : null,
        path.join(os.homedir(), '.config', 'DataWiseCLI', 'desktop-chrome.json'),
    ].filter(Boolean) as string[]
}

function readRendererUi(): RendererUi {
    const override = process.env.DATAWISE_USER_DATA?.trim()
    const candidates = [
        override ? path.join(override, 'renderer-ui.json') : null,
        process.platform === 'win32' && process.env.APPDATA
            ? path.join(process.env.APPDATA, 'DataWiseCLI', 'renderer-ui.json')
            : null,
        process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Application Support', 'DataWiseCLI', 'renderer-ui.json')
            : null,
        path.join(os.homedir(), '.config', 'DataWiseCLI', 'renderer-ui.json'),
    ].filter(Boolean) as string[]

    for (const file of candidates) {
        try {
            if (!fs.existsSync(file)) continue
            return JSON.parse(fs.readFileSync(file, 'utf8')) as RendererUi
        } catch {
            /* try next */
        }
    }
    return {}
}

function resolveModeFromAppearance(appearance: string): 'light' | 'dark' {
    if (appearance === 'dark') return 'dark'
    if (appearance === 'light') return 'light'
    try {
        const scheme = (os as typeof os & {getColorScheme?: () => string}).getColorScheme?.()
        if (scheme === 'dark') return 'dark'
    } catch {
        /* fall through */
    }
    return 'light'
}

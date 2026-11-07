package org.apache.datawise.desktop.ui;

import org.apache.datawise.desktop.prefs.DesktopChromeStore;
import org.apache.datawise.desktop.prefs.RendererUiStore;

/**
 * Injects machine chrome prefs + color before theme-boot / open-screen run.
 *
 * <p>Order is intentional: CSS paint → theme paint JS → shell prefs JS (locale/editor/zoom).
 */
public final class SplashThemeInjector {
    // Keep in sync with theme-presets.ts / public/theme-boot.js UI_FONT_STACKS.
    private static final String UI_FONT_NOTO =
            "'Noto Sans SC Variable', 'Noto Sans SC', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Source Han Sans SC', 'HarmonyOS Sans SC', system-ui, sans-serif";
    private static final String UI_FONT_SYSTEM =
            "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif";
    private static final String UI_FONT_SEGOE =
            "'Segoe UI Variable', 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', system-ui, sans-serif";
    private static final String UI_FONT_YAHEI =
            "'Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI', system-ui, sans-serif";
    private static final String UI_FONT_PINGFANG =
            "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";
    private static final String UI_FONT_SOURCE_HAN =
            "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
    private static final String UI_FONT_HARMONY =
            "'HarmonyOS Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif";
    private static final String UI_FONT_SYSTEM_FALLBACK =
            "system-ui, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif";

    private SplashThemeInjector() {
    }

    public static String seedStyleBlock() {
        DesktopChromeStore.PaintSnapshot paint = DesktopChromeStore.paintSnapshot();
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.snapshot();
        return """
                <style id="dw-host-theme-seed">
                :root { --dw-boot-chrome: %s; --dw-bg-chrome: %s; --dw-primary: %s; }
                html, body, #app, #dw-open-screen {
                  background-color: var(--dw-boot-chrome, %s) !important;
                  color: %s;
                  color-scheme: %s;
                }
                </style>
                <script id="dw-host-paint-seed">%s</script>
                <script id="dw-host-shell-seed">%s</script>
                """.formatted(
                paint.chromeBg(),
                paint.chromeBg(),
                paint.primaryHex(),
                paint.chromeBg(),
                paint.text(),
                paint.resolvedMode(),
                paintSeedJs(paint),
                shellPrefsSeedJs(snap)
        );
    }

    /**
     * CEF {@code loadStart} fallback for Vite (no HtmlBridgeInjector).
     * Seeds prefs so open-screen.js / theme-boot see host theme.
     */
    public static String earlyPaintJs() {
        DesktopChromeStore.PaintSnapshot paint = DesktopChromeStore.paintSnapshot();
        DesktopChromeStore.Snapshot snap = DesktopChromeStore.snapshot();
        return paintSeedJs(paint)
                + shellPrefsSeedJs(snap)
                + "try{if(typeof window.__datawiseThemeBoot==='function'){window.__datawiseThemeBoot(true);}}catch(e){}";
    }

    /**
     * Theme + chrome color seed (paint critical).
     *
     * <p>uiFont / uiTextScale / uiDensity: blank host values become JS {@code null} so we merge
     * prior {@code dw-cli-theme-prefs} instead of wiping them (packaged cold start).
     */
    public static String paintSeedJs(DesktopChromeStore.PaintSnapshot paint) {
        String fontCustomJs = paint.uiFontCustom() == null || paint.uiFontCustom().isBlank()
                ? "null"
                : RendererUiStore.jsString(paint.uiFontCustom());
        String fontSizePxJs = paint.uiFontSizePx() > 0
                ? Double.toString(paint.uiFontSizePx())
                : "null";
        return """
                (function(){
                  var seeded={appearance:%s,background:%s,primary:%s,uiSkin:%s,uiFont:%s,uiFontCustom:%s,uiTextScale:%s,uiFontSizePx:%s,uiDensity:%s};
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
                  }catch(e2){
                    if(!seeded.uiSkin)seeded.uiSkin='classic';
                    if(!seeded.uiFont)seeded.uiFont='noto';
                    if(!seeded.uiFontCustom)seeded.uiFontCustom='';
                    if(!seeded.uiTextScale)seeded.uiTextScale='md';
                    if(!seeded.uiDensity)seeded.uiDensity='md';
                  }
                  try{
                    localStorage.setItem('dw-cli-theme-prefs',JSON.stringify(seeded));
                  }catch(e){}
                  try{
                    var mode=%s;
                    var chrome=%s;
                    var primary=%s;
                    var skin=seeded.uiSkin||'classic';
                    var root=document.documentElement;
                    window.__DW_HOST_CHROME__=chrome;
                    window.__DW_HOST_THEME_MODE__=mode;
                    window.__DW_HOST_PRIMARY__=primary;
                    window.__DW_BOOT_CHROME__=chrome;
                    root.setAttribute('data-theme',mode);
                    root.setAttribute('data-bg-tone',%s);
                    root.setAttribute('data-ui-skin',skin);
                    root.setAttribute('data-ui-font',seeded.uiFont);
                    root.setAttribute('data-ui-text-scale',seeded.uiTextScale);
                    root.setAttribute('data-ui-density',seeded.uiDensity);
                    root.style.colorScheme=mode;
                    root.style.setProperty('--dw-boot-chrome',chrome);
                    root.style.setProperty('--dw-bg-chrome',chrome);
                    root.style.setProperty('--dw-primary',primary);
                    // Keep in sync with theme-presets.ts / theme-boot.js UI_FONT_STACKS
                    var stacks={noto:%s,system:%s,segoe:%s,yahei:%s,pingfang:%s,sourceHan:%s,harmony:%s};
                    var fallback=%s;
                    var fontStack=stacks[seeded.uiFont]||stacks.noto;
                    if(seeded.uiFont==='custom'&&seeded.uiFontCustom){
                      var cn=String(seeded.uiFontCustom).replace(/['";{}\\\\]/g,'').trim();
                      if(cn){fontStack=(cn.indexOf(' ')>=0?("'"+cn+"'"):cn)+', '+fallback;}
                    }
                    root.style.setProperty('--dw-font',fontStack);
                    var bodyPxMap={sm:12,md:13.5,lg:15};
                    var bodyPx=bodyPxMap[seeded.uiTextScale]||13.5;
                    if(seeded.uiTextScale==='custom'&&typeof seeded.uiFontSizePx==='number'){bodyPx=seeded.uiFontSizePx;}
                    root.style.setProperty('--dw-font-size',bodyPx+'px');
                    root.style.setProperty('--dw-ui-text-scale',String(bodyPx/13.5));
                    root.style.backgroundColor=chrome;
                    if(document.body){document.body.style.backgroundColor=chrome;}
                    var cover=document.getElementById('dw-open-screen');
                    if(cover){cover.style.background=chrome;}
                  }catch(e){}
                })();
                """.formatted(
                RendererUiStore.jsString(paint.appearance()),
                RendererUiStore.jsString(paint.background()),
                RendererUiStore.jsString(paint.primary()),
                optionalJsString(paint.uiSkin()),
                optionalJsString(paint.uiFont()),
                fontCustomJs,
                optionalJsString(paint.uiTextScale()),
                fontSizePxJs,
                optionalJsString(paint.uiDensity()),
                RendererUiStore.jsString(paint.resolvedMode()),
                RendererUiStore.jsString(paint.chromeBg()),
                RendererUiStore.jsString(paint.primaryHex()),
                RendererUiStore.jsString(paint.background()),
                RendererUiStore.jsString(UI_FONT_NOTO),
                RendererUiStore.jsString(UI_FONT_SYSTEM),
                RendererUiStore.jsString(UI_FONT_SEGOE),
                RendererUiStore.jsString(UI_FONT_YAHEI),
                RendererUiStore.jsString(UI_FONT_PINGFANG),
                RendererUiStore.jsString(UI_FONT_SOURCE_HAN),
                RendererUiStore.jsString(UI_FONT_HARMONY),
                RendererUiStore.jsString(UI_FONT_SYSTEM_FALLBACK)
        );
    }

    /** Blank → JS {@code null} (merge prior localStorage); otherwise quoted string. */
    private static String optionalJsString(String value) {
        if (value == null || value.isBlank()) {
            return "null";
        }
        return RendererUiStore.jsString(value);
    }

    /** Locale / editor font / zoom seed (after paint). */
    public static String shellPrefsSeedJs(DesktopChromeStore.Snapshot snap) {
        String localeJs = snap.locale() == null || snap.locale().isBlank()
                ? "null"
                : RendererUiStore.jsString(snap.locale());
        String fontFamilyJs = snap.editorFontFamily() == null || snap.editorFontFamily().isBlank()
                ? "''"
                : RendererUiStore.jsString(snap.editorFontFamily());
        return """
                try{
                  var locale=%s;
                  if(locale){
                    localStorage.setItem('dw-cli-locale',locale);
                    document.documentElement.lang=locale;
                  }
                }catch(e){}
                try{
                  var fontSize=%d;
                  var fontFamily=%s;
                  if(fontSize>0||fontFamily){
                    var ed={};
                    try{ed=JSON.parse(localStorage.getItem('dw-cli-editor-settings')||'{}');}catch(e2){}
                    if(fontSize>0)ed.fontSize=fontSize;
                    if(fontFamily)ed.fontFamily=fontFamily;
                    localStorage.setItem('dw-cli-editor-settings',JSON.stringify(ed));
                  }
                }catch(e){}
                try{window.__DW_HOST_ZOOM__=%s;}catch(e){}
                """.formatted(
                localeJs,
                snap.editorFontSize(),
                fontFamilyJs,
                Double.toString(snap.zoomLevel())
        );
    }
}

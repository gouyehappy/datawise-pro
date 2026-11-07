/*
 * Translation 即时翻译 —— 界面国际化
 * ==========================================================================
 * 为什么前端要自建 i18n：
 *
 *   manifest.json 的 localizations 只覆盖【manifest 层】的文案
 *   （插件名称、说明、贡献点 label/description、连接字段与动作），
 *   官方文档明确说明它「不会翻译插件 UI 自己的文本」。
 *   因此界面里的每个字符串都必须由前端自己管。
 *
 * 语言来源：datawisePlugin.locale，并监听 dbx-plugin-env 事件实时刷新
 * （用户改宿主语言后不需要重开工作台）。
 */
(function () {
  "use strict";

  var I18N = window.TranslationI18N = window.TranslationI18N || {};

  var dict = {
    "zh-CN": {
      appTitle: "Translation 即时翻译",
      viewTranslate: "翻译",
      viewEngines: "引擎",
      viewHistory: "历史",
      viewSettings: "设置",

      // 翻译页
      sourceText: "原文",
      targetText: "译文",
      sourcePlaceholder: "在此输入或粘贴要翻译的文本…",
      dstEmpty: "译文将显示在这里",
      translate: "翻译",
      translating: "翻译中…",
      cancel: "取消",
      copy: "复制",
      clear: "清空",
      paste: "粘贴",
      swapLang: "交换语言方向",
      engine: "引擎",
      manage: "管理",
      instant: "输入即译",
      stream: "流式输出",
      noEngineTitle: "没有可用的翻译引擎",
      noEngineDesc: "当前版本支持：内置免费引擎、OpenAI 兼容大模型（DeepSeek / 通义 / Ollama 等），以及 DataWise 已配置的宿主 AI。",
      addEngine: "添加引擎",
      manageEngines: "管理引擎…",
      hostAiEngine: "宿主 AI",
      hostAiBadge: "宿主",
      hostAiUnavailable: "宿主 AI 未配置。请先在 DataWise AI 设置中配置默认模型。",
      errAddOpenai: "配置 OpenAI 引擎",
      errUseHostAi: "改用宿主 AI",
      errTooLong: "文本可能超长，请缩短后重试，或改用 OpenAI / 宿主 AI",
      errRateLimit: "公益端点繁忙或限流，建议换 OpenAI 引擎或宿主 AI",
      copied: "已复制到剪贴板",
      copyFailed: "复制失败，请手动选择文本复制",
      copyDiagShort: "复制诊断",
      pasted: "已粘贴",
      pasteEmpty: "剪贴板为空",
      pasteFailed: "读取剪贴板失败",
      pasteShortcutHint: "也可按 Ctrl+V（macOS 为 Cmd+V）粘贴",
      pendingLoaded: "已载入待译文本（{source}）",
      pendingSourceResult: "结果 SQL",
      pendingSourceContext: "对象名称",
      metaChunks: "{n} 段",
      schemaLoadFailed: "引擎配置表单加载失败，请点击「重新连接侧车」后重试",
      importTooLarge: "内容过大（{kb} KB），超过 1.5 MB 上限",
      importReadFailed: "读取文件失败",
      swapLangAutoBlock: "源语言为「自动检测」时无法交换，请先指定源语言",
      ariaSourceLang: "源语言",
      ariaTargetLang: "目标语言",
      ariaEngine: "翻译引擎",
      ariaDst: "译文",
      ariaViewToggle: "视图切换",
      titleClose: "关闭",
      titleSplitter: "拖动调整比例",
      emptySource: "请先输入要翻译的文本",
      tooLongForInstant: "文本较长（{n} 字符），已暂停自动翻译。请点击「翻译」按钮手动执行。",
      cancelled: "已取消翻译",
      hardCutHint: "文本过长已强制切分，译文质量可能下降",

      // 引擎页
      engineList: "引擎列表",
      engineEmptyTitle: "还没有引擎",
      engineEmptyDesc: "点击右上角「添加引擎」创建第一个翻译引擎。",
      engineType: "引擎类型",
      engineName: "引擎名称",
      engineNamePlaceholder: "例如：阿里云翻译（生产）",
      engineNameHint: "同类型可添加多个，用名称区分。留空则使用默认名称。" +
        "最长约 16 个汉字（或 32 个字母）。",
      engineNameRequired: "请填写引擎名称",
      testConnection: "测试连接",
      testing: "测试中…",
      delete: "删除",
      save: "保存",
      editEngine: "编辑引擎",
      defaultBadge: "默认",
      disabledBadge: "已禁用",
      builtinBadge: "内置",
      builtinSub: "无需配置 · 公益端点，不保证长期可用",
      builtinEngineTitle: "内置引擎说明",
      builtinInfoBtn: "说明",
      builtinDone: "知道了",
      builtinLocked: "内置引擎的名称、类型与配置都不可修改。不想用它时可以「禁用」，或把别的引擎设为默认。",
      freeNotice: "当前使用的是内置免费服务：公益端点，高峰期可能变慢或失败。稳定使用建议配置 OpenAI 兼容引擎或宿主 AI。",
      freeNoticeGo: "去配置",
      freeNoticeClose: "不再提示",
      noEngine: "（没有可用引擎）",
      groupBasics: "常用",
      groupAdvanced: "高级选项",
      setDefault: "设为默认",
      enable: "启用",
      disable: "禁用",
      edit: "编辑",
      deleteEngineConfirm: "确定删除引擎「{name}」吗？",
      deleteEngineNote: "该引擎的 API Key 也会一并删除，此操作不可撤销。",
      engineSaved: "引擎已保存",
      engineDeleted: "引擎已删除",
      testOk: "连接成功（{ms} 毫秒）",
      secretKept: "（保留原有 API Key）",
      secretCleared: "（已清除 API Key）",
      fieldRequired: "「{label}」为必填项",
      insecureSecretBanner: "系统密钥库不可用，API Key 仅以机器绑定方式混淆存储，安全性降低。",

      // 历史页
      searchHistory: "搜索原文或译文…",
      all: "全部",
      starred: "已收藏",
      clearHistory: "清空历史",
      historyEmptyTitle: "还没有翻译记录",
      historyEmptyDesc: "翻译过的内容（含宿主 AI）会自动保存在这里。",
      clearHistoryConfirm: "确定清空全部翻译历史吗？",
      clearHistoryNote: "已收藏的记录会保留。此操作不可撤销。",
      historyCleared: "已清空 {n} 条记录",
      historyDeleted: "已删除 {n} 条记录",
      star: "收藏",
      unstar: "取消收藏",
      reuse: "用这条重新翻译",
      prevPage: "上一页",
      nextPage: "下一页",
      pageInfo: "第 {cur} / {total} 页，共 {n} 条",

      // 设置页
      settings: "设置",
      groupAppearance: "外观（跟随宿主）",
      appearanceFollowNote: "主题、字体与界面语言均自动跟随 DataWise 设置，修改后实时同步，无需在此配置。",
      currentTheme: "当前主题",
      currentLocale: "界面语言",
      currentFont: "UI 字体",
      hostTokens: "宿主主题变量",
      followHost: "跟随宿主",
      fontFollowHost: "跟随宿主（未投递字体变量）",
      themeLight: "浅色",
      themeDark: "深色",
      groupInstant: "输入即译",
      groupTranslate: "翻译行为",
      groupHistory: "历史",
      groupData: "数据与诊断",
      instantEnabled: "启用输入即译",
      instantDebounce: "触发延迟（毫秒）",
      instantMinChars: "最少字符数",
      instantMaxLength: "自动翻译长度上限",
      instantNote: "超过长度上限时不会自动翻译，需手动点击「翻译」按钮。",
      streamEnabled: "启用流式输出",
      identifierSplit: "标识符自动分词",
      identifierSplitNote: "翻译 linearGradient、request_method、LOGIN_TIME 这类字段名/变量名时，送进引擎前会自动拆成空格短语，否则机器翻译引擎常把整串原样吐回。拆分只发生在发往引擎的那一份数据上：原文、译文与历史记录都保持原样，用户无感知；全大写词（如 US、HTTP）一律不动。",
      autoDirection: "方向自适应",
      autoDirectionNote: "默认开启：当原文与目标语言属于同一文字体系时（例如目标是中文、却贴进来一段中文），自动换成反向翻译，避免译文和原文一模一样。换向时目标语言下拉会随之改变并给出提示。",
      directionSwapped: "已识别原文为{detected}，本次按 {from} → {to} 翻译。",
      chunkDelay: "分段间隔（毫秒）",
      chunkDelayNote: "长文本会被自动分段翻译。百度、有道等免费额度通常为 1 QPS，建议保持 1100 毫秒以上以避免触发限流。",
      defaultSourceLang: "默认源语言",
      defaultTargetLang: "默认目标语言",
      historyLimit: "保留条数上限",
      historyLimitNote: "超出上限时自动删除最旧的记录，已收藏的记录不会被删除。",
      dataDir: "数据目录",
      dbFile: "数据库文件",
      sidecarVersion: "侧车版本",
      secretScheme: "密钥保护方案",
      secretSecureYes: "（系统密钥库，真加密）",
      secretSecureNo: "（机器绑定混淆，安全性较低）",
      saveSettings: "保存设置",
      settingsSaved: "设置已保存",
      reconnect: "重新连接侧车",
      exportData: "导出数据…",
      importData: "导入数据…",
      showDiag: "查看诊断报告",
      diagTitle: "诊断报告",
      diagHint: "遇到问题时，复制下面的报告发给开发者。报告不含 API Key（已自动脱敏）。",
      copyReport: "复制报告",

      // 导入导出
      exportTitle: "导出数据",
      exportQuestion: "导出内容包含引擎配置、翻译历史与界面偏好。是否同时包含 API Key？",
      exportWithSecrets: "包含 API Key（明文，用于迁移到另一台机器）",
      exportWithoutSecrets: "不包含 API Key（推荐，更安全）",
      exportSecretWarning: "导出的文件将包含 API Key 明文，请通过安全渠道传输，导入后立即删除。",
      exportDone: "已导出到 {path}",
      exportCopied: "导出内容已复制到剪贴板。请粘贴到 .json 文件保存；若弹出另存为对话框也可直接保存。",
      importDone: "导入完成：引擎 {engines} 个、历史 {history} 条、密钥 {secrets} 个",
      importMerge: "合并（保留现有数据）",
      importReplace: "替换（先清空现有数据）",
      importTitle: "导入数据",
      importQuestion: "选择导入方式：",
      importSourceQuestion: "从哪里导入？",
      importFromClipboard: "从剪贴板粘贴 JSON",
      importFromFile: "选择文件…",

      // 状态条
      statusInit: "初始化中…",
      statusReady: "就绪",
      statusNoSidecar: "侧车不可用：数据未持久化",
      statusNoDb: "数据存储不可用：配置与历史无法保存",
      statusNotPersistent: "未持久化（会话内存）",
      retry: "重试连接",
      reconnecting: "正在重新连接侧车…",
      reconnected: "侧车已重新连接",
      reconnectFailed: "侧车重连失败",

      // 通用
      confirm: "确定",
      error: "出错",
      unknownError: "未知错误",
      conflictRetry: "配置已被其它会话修改，已自动重试",
      genericFail: "操作失败：{msg}"
    },

    "en": {
      appTitle: "Translation",
      viewTranslate: "Translate",
      viewEngines: "Engines",
      viewHistory: "History",
      viewSettings: "Settings",

      sourceText: "Source",
      targetText: "Translation",
      sourcePlaceholder: "Type or paste text to translate…",
      dstEmpty: "Translation will appear here",
      translate: "Translate",
      translating: "Translating…",
      cancel: "Cancel",
      copy: "Copy",
      clear: "Clear",
      paste: "Paste",
      swapLang: "Swap languages",
      engine: "Engine",
      manage: "Manage",
      instant: "Translate as you type",
      stream: "Streaming",
      noEngineTitle: "No translation engine available",
      noEngineDesc: "This build supports the built-in free engine, OpenAI-compatible LLMs (DeepSeek / Qwen / Ollama…), and DataWise host AI when configured.",
      addEngine: "Add engine",
      manageEngines: "Manage engines…",
      hostAiEngine: "Host AI",
      hostAiBadge: "Host",
      hostAiUnavailable: "Host AI is not configured. Set a default model in DataWise AI settings first.",
      errAddOpenai: "Configure OpenAI engine",
      errUseHostAi: "Use host AI",
      errTooLong: "Text may be too long — shorten it, or switch to OpenAI / host AI",
      errRateLimit: "Free endpoint is busy or rate-limited — try OpenAI or host AI",
      copied: "Copied to clipboard",
      copyFailed: "Copy failed, please select and copy manually",
      copyDiagShort: "Copy diagnostics",
      pasted: "Pasted",
      pasteEmpty: "Clipboard is empty",
      pasteFailed: "Failed to read clipboard",
      pasteShortcutHint: "You can also press Ctrl+V (Cmd+V on macOS)",
      pendingLoaded: "Loaded text to translate ({source})",
      pendingSourceResult: "Result SQL",
      pendingSourceContext: "Object name",
      metaChunks: "{n} chunks",
      schemaLoadFailed: "Failed to load engine form — reconnect the sidecar and try again",
      importTooLarge: "Payload too large ({kb} KB); limit is 1.5 MB",
      importReadFailed: "Failed to read file",
      swapLangAutoBlock: "Cannot swap while source is Auto-detect — pick a source language first",
      ariaSourceLang: "Source language",
      ariaTargetLang: "Target language",
      ariaEngine: "Translation engine",
      ariaDst: "Translation",
      ariaViewToggle: "View switcher",
      titleClose: "Close",
      titleSplitter: "Drag to resize",
      emptySource: "Please enter text to translate first",
      tooLongForInstant: "Text is long ({n} chars); auto-translate paused. Click Translate to run manually.",
      cancelled: "Translation cancelled",
      hardCutHint: "Text was force-split; quality may be reduced",

      engineList: "Engines",
      engineEmptyTitle: "No engines yet",
      engineEmptyDesc: "Click “Add engine” to create your first translation engine.",
      engineType: "Engine type",
      engineName: "Engine name",
      engineNamePlaceholder: "e.g. Alibaba Translate (prod)",
      engineNameHint: "You can add several engines of the same type; the name tells them apart. Leave empty to use the default name. Up to about 16 CJK characters (or 32 Latin ones).",
      engineNameRequired: "Please enter an engine name",
      testConnection: "Test connection",
      testing: "Testing…",
      delete: "Delete",
      save: "Save",
      editEngine: "Edit engine",
      defaultBadge: "Default",
      disabledBadge: "Disabled",
      builtinBadge: "Built-in",
      builtinSub: "Zero config · community endpoint, no availability guarantee",
      builtinEngineTitle: "Built-in engine",
      builtinInfoBtn: "Details",
      builtinDone: "Got it",
      builtinLocked: "A built-in engine\u2019s name, type and configuration cannot be changed. To stop using it, disable it or set another engine as default.",
      freeNotice: "You are using the built-in free service: a community endpoint that may slow down or fail at peak times. Prefer an OpenAI-compatible engine or host AI for dependable use.",
      freeNoticeGo: "Set up",
      freeNoticeClose: "Don\u2019t show again",
      noEngine: "(no engine available)",
      groupBasics: "Basics",
      groupAdvanced: "Advanced",
      setDefault: "Set as default",
      enable: "Enable",
      disable: "Disable",
      edit: "Edit",
      deleteEngineConfirm: "Delete engine “{name}”?",
      deleteEngineNote: "Its API key will also be removed. This cannot be undone.",
      engineSaved: "Engine saved",
      engineDeleted: "Engine deleted",
      testOk: "Connected ({ms} ms)",
      secretKept: "(existing API key kept)",
      secretCleared: "(API key cleared)",
      fieldRequired: "“{label}” is required",
      insecureSecretBanner: "OS keychain unavailable; API keys are stored with machine-bound obfuscation only, which is less secure.",

      searchHistory: "Search source or translation…",
      all: "All",
      starred: "Starred",
      clearHistory: "Clear history",
      historyEmptyTitle: "No translations yet",
      historyEmptyDesc: "Translated text (including Host AI) is saved here automatically.",
      clearHistoryConfirm: "Clear all translation history?",
      clearHistoryNote: "Starred entries are kept. This cannot be undone.",
      historyCleared: "Cleared {n} entries",
      historyDeleted: "Deleted {n} entries",
      star: "Star",
      unstar: "Unstar",
      reuse: "Translate this again",
      prevPage: "Previous",
      nextPage: "Next",
      pageInfo: "Page {cur} / {total}, {n} entries",

      settings: "Settings",
      groupAppearance: "Appearance (follows host)",
      appearanceFollowNote: "Theme, fonts and interface language all follow DataWise automatically. Changes are picked up live; nothing to configure here.",
      currentTheme: "Current theme",
      currentLocale: "Interface language",
      currentFont: "UI font",
      hostTokens: "Host theme tokens",
      followHost: "follows host",
      fontFollowHost: "Follows host (no font token delivered)",
      themeLight: "Light",
      themeDark: "Dark",
      groupInstant: "Translate as you type",
      groupTranslate: "Translation behaviour",
      groupHistory: "History",
      groupData: "Data & diagnostics",
      instantEnabled: "Enable translate-as-you-type",
      instantDebounce: "Debounce (ms)",
      instantMinChars: "Minimum characters",
      instantMaxLength: "Auto-translate length limit",
      instantNote: "Longer text is not auto-translated; click Translate to run it manually.",
      streamEnabled: "Enable streaming output",
      identifierSplit: "Auto-split identifiers",
      identifierSplitNote: "Field and variable names such as linearGradient, request_method or LOGIN_TIME are split into spaced words only in the copy sent to the engine, because machine-translation engines otherwise echo such strings back verbatim. The source text, the translation and the history all stay exactly as entered, so this is invisible in normal use. All-caps words such as US or HTTP are never altered.",
      autoDirection: "Auto direction",
      autoDirectionNote: "On by default. When the source text and the target language belong to the same script (e.g. the target is Chinese but you pasted Chinese text), the direction is flipped automatically so the translation is not an echo of the source. The target language dropdown follows the switch and the reason is shown.",
      directionSwapped: "Detected {detected}; this time translated {from} → {to}.",
      chunkDelay: "Delay between chunks (ms)",
      chunkDelayNote: "Long text is split automatically. Free tiers of Baidu/Youdao are usually 1 QPS, so keep this at 1100 ms or higher to avoid rate limits.",
      defaultSourceLang: "Default source language",
      defaultTargetLang: "Default target language",
      historyLimit: "History limit",
      historyLimitNote: "Oldest entries are pruned beyond this limit; starred entries are never pruned.",
      dataDir: "Data directory",
      dbFile: "Database file",
      sidecarVersion: "Sidecar version",
      secretScheme: "Key protection",
      secretSecureYes: "(OS keychain, real encryption)",
      secretSecureNo: "(machine-bound obfuscation, less secure)",
      saveSettings: "Save settings",
      settingsSaved: "Settings saved",
      reconnect: "Reconnect sidecar",
      exportData: "Export data…",
      importData: "Import data…",
      showDiag: "View diagnostics",
      diagTitle: "Diagnostics",
      diagHint: "Copy this report when reporting an issue. It contains no API keys (redacted automatically).",
      copyReport: "Copy report",

      exportTitle: "Export data",
      exportQuestion: "The export contains engine config, history and preferences. Include API keys?",
      exportWithSecrets: "Include API keys (plaintext, for migrating to another machine)",
      exportWithoutSecrets: "Exclude API keys (recommended, safer)",
      exportSecretWarning: "The exported file will contain API keys in plaintext. Transfer it securely and delete it after importing.",
      exportDone: "Exported to {path}",
      exportCopied: "Export copied to the clipboard. Paste into a .json file to keep it; use Save As if a dialog also appears.",
      importDone: "Imported: {engines} engines, {history} history entries, {secrets} keys",
      importMerge: "Merge (keep existing data)",
      importReplace: "Replace (clear existing data first)",
      importTitle: "Import data",
      importQuestion: "Choose an import mode:",
      importSourceQuestion: "Where should we import from?",
      importFromClipboard: "Paste JSON from clipboard",
      importFromFile: "Choose a file…",

      statusInit: "Initialising…",
      statusReady: "Ready",
      statusNoSidecar: "Sidecar unavailable: data is not persisted",
      statusNoDb: "Storage unavailable: config and history cannot be saved",
      statusNotPersistent: "Not persisted (session memory)",
      retry: "Retry",
      reconnecting: "Reconnecting sidecar…",
      reconnected: "Sidecar reconnected",
      reconnectFailed: "Sidecar reconnection failed",

      confirm: "OK",
      error: "Error",
      unknownError: "Unknown error",
      conflictRetry: "Config was changed by another session; retried automatically",
      genericFail: "Operation failed: {msg}"
    }
  };

  var current = "zh-CN";

  // normalize 把任意语言标识归一到字典支持的键。
  //
  // 宿主可能给 "zh-CN"、"zh"、"zh-TW"、"en-US"、"en" 等形态，
  // 归一化规则：以 zh 开头一律用 zh-CN，其余非中文一律用 en。
  // 这样即使宿主给出 "zh-TW" 也有合理回退，不会整页变成键名。
  function normalize(loc) {
    var low = String(loc || "").toLowerCase();
    if (low.indexOf("zh") === 0) { return "zh-CN"; }
    if (low.indexOf("en") === 0) { return "en"; }
    return "";   // 无法识别 → 交给调用方决定回退
  }

  // detect 决定当前语言：完全跟随宿主，无法识别时回退 zh-CN。
  //
  // 【不提供手动覆盖】—— 界面语言一律跟随 DBX（用户明确要求）。
  // 用户在 DataWise 里切了语言，本插件通过 dbx-plugin-env 事件实时同步。
  function detect() {
    var hostLoc = "";
    try {
      var p = window.datawisePlugin;
      if (p && typeof p.getHostInfo === "function") {
        var info = p.getHostInfo();
        if (info && info.locale) { hostLoc = String(info.locale); }
      }
      if (!hostLoc && p && p.locale) { hostLoc = String(p.locale); }
    } catch (e) { /* 忽略 */ }
    // 宿主给了无法识别的值时回退 zh-CN（本插件的主要用户是中文开发者）
    current = normalize(hostLoc) || "zh-CN";
    return current;
  }

  // t 取当前语言的文案，支持 {name} 占位符替换。
  //
  // 缺失键时回退到 zh-CN，再回退到键名本身 —— 绝不返回 undefined，
  // 否则界面会出现 "undefined" 字样，比显示英文更难排查。
  function t(key, vars) {
    var table = dict[current] || dict["zh-CN"];
    var s = table[key];
    if (s === undefined) { s = dict["zh-CN"][key]; }
    if (s === undefined) { s = key; }
    if (vars && typeof s === "string") {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return (vars[name] !== undefined && vars[name] !== null) ? String(vars[name]) : m;
      });
    }
    return s;
  }

  // apply 把 DOM 里带 data-i18n / data-i18n-placeholder / data-i18n-title /
  // data-i18n-aria-label 的节点全部刷新。
  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (key) { nodes[i].textContent = t(key); }
    }
    var phs = scope.querySelectorAll("[data-i18n-placeholder]");
    for (var j = 0; j < phs.length; j++) {
      var pkey = phs[j].getAttribute("data-i18n-placeholder");
      if (pkey) { phs[j].setAttribute("placeholder", t(pkey)); }
    }
    var titles = scope.querySelectorAll("[data-i18n-title]");
    for (var k = 0; k < titles.length; k++) {
      var tkey = titles[k].getAttribute("data-i18n-title");
      if (tkey) { titles[k].setAttribute("title", t(tkey)); }
    }
    var arias = scope.querySelectorAll("[data-i18n-aria-label]");
    for (var m = 0; m < arias.length; m++) {
      var akey = arias[m].getAttribute("data-i18n-aria-label");
      if (akey) { arias[m].setAttribute("aria-label", t(akey)); }
    }
    // 同步 <html lang>，让屏幕阅读器与浏览器拼写检查用对语言
    try { document.documentElement.lang = (current === "zh-CN") ? "zh-CN" : "en"; } catch (e) { /* 忽略 */ }
  }

  I18N.detect = detect;
  I18N.t = t;
  I18N.apply = apply;
  I18N.locale = function () { return current; };
  I18N.has = function (loc) { return !!dict[loc]; };
  // hostLocale 返回宿主当前语言（归一化后），供设置页只读展示与诊断日志使用。
  I18N.hostLocale = function () {
    try {
      var p = window.datawisePlugin;
      var raw = "";
      if (p && typeof p.getHostInfo === "function") {
        var info = p.getHostInfo();
        if (info && info.locale) { raw = String(info.locale); }
      }
      if (!raw && p && p.locale) { raw = String(p.locale); }
      return normalize(raw) || raw;
    } catch (e) { /* 忽略 */ }
    return "";
  };

  // 便捷全局别名：界面代码里大量使用，短名字更清爽
  window.t = t;
})();

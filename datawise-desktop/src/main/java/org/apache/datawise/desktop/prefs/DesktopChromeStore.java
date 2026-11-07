package org.apache.datawise.desktop.prefs;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.apache.datawise.desktop.DesktopPaths;
import org.apache.datawise.desktop.util.SystemThemeUtil;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Machine-scoped chrome / shell prefs (last-write-wins).
 *
 * <p>Theme colors are read before CEF paints so AWT, Chromium background, and HTML seed share one color.
 * Also stores locale, page zoom, editor fonts, and shell uiFont / uiTextScale / uiDensity —
 * not tied to app login users.
 */
public final class DesktopChromeStore {
    private static final String FILE = "desktop-chrome.json";
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final AtomicReference<Snapshot> CACHE = new AtomicReference<>();

    private static final Map<String, String> PRIMARY = Map.of(
            "violet", "#7c3aed",
            "blue", "#2563eb",
            "cyan", "#0891b2",
            "green", "#16a34a",
            "orange", "#ea580c",
            "rose", "#e11d48"
    );
    private static final Set<String> PRIMARY_TONES = PRIMARY.keySet();
    private static final Set<String> BACKGROUNDS = Set.of("default", "warm", "cool", "slate");
    private static final Map<String, String> BG_LIGHT = Map.of(
            "default", "#ffffff",
            "warm", "#faf9f7",
            "cool", "#f8fafc",
            "slate", "#f4f6f8"
    );
    /** Keep in sync with theme-presets.ts BACKGROUND_PRESETS_DARK. */
    private static final Map<String, String> BG_DARK = Map.of(
            "default", "#0c0c0e",
            "warm", "#100e0c",
            "cool", "#0c1015",
            "slate", "#0e1013"
    );
    private static final Map<String, String> BG_DARK_RAIL = Map.of(
            "default", "#080809",
            "warm", "#0c0a08",
            "cool", "#090c10",
            "slate", "#0a0c0f"
    );
    private static final String LIGHT_CHROME = "#dce4ee";
    private static final Set<String> LOCALES = Set.of("zh-CN", "en-US");
    private static final Set<String> EDITOR_FONTS = Set.of(
            "Monaco", "Consolas", "Courier New", "JetBrains Mono"
    );
    private static final Set<String> UI_TEXT_SCALE_IDS = Set.of("sm", "md", "lg", "custom");
    private static final Set<String> UI_DENSITY_IDS = Set.of("sm", "md", "lg");
    private static final int EDITOR_FONT_SIZE_MIN = 12;
    private static final int EDITOR_FONT_SIZE_MAX = 24;
    /** Keep in sync with theme-presets.ts UI_FONT_SIZE_PX_*. */
    private static final double UI_FONT_SIZE_PX_MIN = 11.0;
    private static final double UI_FONT_SIZE_PX_MAX = 18.0;
    private static final double UI_FONT_SIZE_PX_STEP = 0.5;
    private static final int UI_FONT_CUSTOM_MAX_LEN = 64;
    /** Keep in sync with {@code DesktopBrowserZoom.MIN/MAX}. */
    private static final double ZOOM_MIN = -5.0;
    private static final double ZOOM_MAX = 5.0;

    /**
     * Full machine snapshot (paint + shell). Prefer {@link #paintSnapshot()} on the cold-start path.
     */
    public record Snapshot(
            String appearance,
            String background,
            String primary,
            String uiSkin,
            String uiFont,
            String uiFontCustom,
            String uiTextScale,
            double uiFontSizePx,
            String uiDensity,
            String resolvedMode,
            String chromeBg,
            String editorBg,
            String text,
            String primaryHex,
            String locale,
            double zoomLevel,
            int editorFontSize,
            String editorFontFamily,
            String updatedAt
    ) {
        public PaintSnapshot paint() {
            return new PaintSnapshot(
                    appearance, background, primary, uiSkin,
                    uiFont, uiFontCustom, uiTextScale, uiFontSizePx, uiDensity,
                    resolvedMode, chromeBg, editorBg, text, primaryHex
            );
        }
    }

    /** Paint-critical fields only (AWT / CEF / HTML first frame). */
    public record PaintSnapshot(
            String appearance,
            String background,
            String primary,
            String uiSkin,
            String uiFont,
            String uiFontCustom,
            String uiTextScale,
            double uiFontSizePx,
            String uiDensity,
            String resolvedMode,
            String chromeBg,
            String editorBg,
            String text,
            String primaryHex
    ) {
    }

    private static final AtomicReference<Boolean> LEGACY_ZOOM_TRIED = new AtomicReference<>(Boolean.FALSE);

    private DesktopChromeStore() {
    }

    public static Path file() {
        return DesktopPaths.machineDataDir().resolve(FILE);
    }

    /** Process-cached snapshot; reloads from disk when cache empty. */
    public static Snapshot snapshot() {
        Snapshot cached = CACHE.get();
        if (cached != null) {
            return cached;
        }
        Snapshot loaded = loadOrMigrate();
        CACHE.set(loaded);
        return loaded;
    }

    /**
     * Cold-start paint view — same cache as {@link #snapshot()}, but callers should not
     * trigger shell side-effects (legacy zoom migrate) before first frame.
     */
    public static PaintSnapshot paintSnapshot() {
        return snapshot().paint();
    }

    public static void invalidateCache() {
        CACHE.set(null);
        LEGACY_ZOOM_TRIED.set(Boolean.FALSE);
    }

    /**
     * Patch from renderer {@code uiStore:persist}.
     * Canonical keys: appearance / background / primary / uiSkin / uiFont / uiTextScale /
     * uiDensity / locale / zoomLevel / editorFontSize / editorFontFamily.
     * Legacy {@code theme*} keys still accepted.
     */
    public static Snapshot writeThemePatch(JsonObject patch) {
        return writePatch(patch);
    }

    public static Snapshot writePatch(JsonObject patch) {
        Snapshot cur = snapshot();
        String appearance = cur.appearance();
        String background = cur.background();
        String primary = cur.primary();
        String uiSkin = cur.uiSkin();
        String uiFont = cur.uiFont();
        String uiFontCustom = cur.uiFontCustom();
        String uiTextScale = cur.uiTextScale();
        double uiFontSizePx = cur.uiFontSizePx();
        String uiDensity = cur.uiDensity();
        String locale = cur.locale();
        double zoomLevel = cur.zoomLevel();
        int editorFontSize = cur.editorFontSize();
        String editorFontFamily = cur.editorFontFamily();
        if (patch != null) {
            // Canonical keys first; theme* kept as read aliases for older clients.
            appearance = normalizeAppearance(firstNonBlank(
                    firstNonBlank(str(patch, "appearance"), str(patch, "themeAppearance")),
                    appearance));
            background = normalizeBackground(firstNonBlank(
                    firstNonBlank(str(patch, "background"), str(patch, "themeBackground")),
                    background));
            primary = normalizePrimary(firstNonBlank(
                    firstNonBlank(str(patch, "primary"), str(patch, "themePrimary")),
                    primary));
            String skin = firstNonBlank(str(patch, "uiSkin"), str(patch, "themeUiSkin"));
            if (skin != null && !skin.isBlank()) {
                uiSkin = normalizeUiSkin(skin);
            }
            String font = firstNonBlank(str(patch, "uiFont"), str(patch, "themeUiFont"));
            if (font != null && !font.isBlank()) {
                uiFont = normalizeUiFont(font);
            }
            if (patch.has("uiFontCustom")) {
                uiFontCustom = sanitizeUiFontCustom(str(patch, "uiFontCustom"));
            }
            String textScale = firstNonBlank(str(patch, "uiTextScale"), str(patch, "themeUiTextScale"));
            if (textScale != null && !textScale.isBlank()) {
                uiTextScale = normalizeUiTextScaleId(textScale);
            }
            if (patch.has("uiFontSizePx") && !patch.get("uiFontSizePx").isJsonNull()) {
                uiFontSizePx = clampUiFontSizePx(asDouble(patch, "uiFontSizePx", uiFontSizePx));
            }
            String density = firstNonBlank(str(patch, "uiDensity"), str(patch, "themeUiDensity"));
            if (density != null && !density.isBlank()) {
                uiDensity = normalizeUiDensityId(density);
            }
            if (patch.has("locale")) {
                locale = normalizeLocale(str(patch, "locale"));
            }
            if (patch.has("zoomLevel") && !patch.get("zoomLevel").isJsonNull()) {
                zoomLevel = clampZoom(asDouble(patch, "zoomLevel", zoomLevel));
            }
            if (patch.has("editorFontSize") && !patch.get("editorFontSize").isJsonNull()) {
                editorFontSize = clampFontSize(asInt(patch, "editorFontSize", editorFontSize));
            }
            if (patch.has("editorFontFamily")) {
                editorFontFamily = normalizeFontFamily(str(patch, "editorFontFamily"));
            }
        }
        Snapshot next = build(
                appearance,
                background,
                primary,
                uiSkin,
                uiFont,
                uiFontCustom,
                uiTextScale,
                uiFontSizePx,
                uiDensity,
                locale,
                zoomLevel,
                editorFontSize,
                editorFontFamily,
                Instant.now().toString()
        );
        persist(next);
        CACHE.set(next);
        return next;
    }

    /** Persist CEF zoom (also called from {@link org.apache.datawise.desktop.ui.DesktopBrowserZoom}). */
    public static Snapshot writeZoomLevel(double level) {
        JsonObject patch = new JsonObject();
        patch.addProperty("zoomLevel", clampZoom(level));
        return writePatch(patch);
    }

    /**
     * When appearance is {@code system}, recompute resolvedMode/chromeBg from the OS without
     * changing the stored appearance preference.
     */
    public static Snapshot refreshResolvedModeFromOs() {
        Snapshot cur = snapshot();
        if (!"system".equalsIgnoreCase(cur.appearance())) {
            return cur;
        }
        Snapshot next = build(
                cur.appearance(),
                cur.background(),
                cur.primary(),
                cur.uiSkin(),
                cur.uiFont(),
                cur.uiFontCustom(),
                cur.uiTextScale(),
                cur.uiFontSizePx(),
                cur.uiDensity(),
                cur.locale(),
                cur.zoomLevel(),
                cur.editorFontSize(),
                cur.editorFontFamily(),
                Instant.now().toString()
        );
        if (next.resolvedMode().equals(cur.resolvedMode()) && next.chromeBg().equals(cur.chromeBg())) {
            return cur;
        }
        persist(next);
        CACHE.set(next);
        return next;
    }

    /**
     * Zoom for CEF restore — lazily migrates once from {@code window-state.json} after paint.
     */
    public static double zoomLevelForRestore() {
        Snapshot cur = snapshot();
        if (cur.zoomLevel() != 0.0) {
            return cur.zoomLevel();
        }
        if (!LEGACY_ZOOM_TRIED.compareAndSet(Boolean.FALSE, Boolean.TRUE)) {
            return cur.zoomLevel();
        }
        double legacy = readLegacyZoom();
        if (legacy == 0.0) {
            return 0.0;
        }
        return writeZoomLevel(legacy).zoomLevel();
    }

    private static Snapshot loadOrMigrate() {
        Path path = file();
        if (Files.isRegularFile(path)) {
            try {
                JsonObject obj = JsonParser.parseString(Files.readString(path, StandardCharsets.UTF_8))
                        .getAsJsonObject();
                // Paint-critical load: do not touch WindowStateStore here (defer to zoomLevelForRestore).
                return fromJson(obj);
            } catch (Exception ignored) {
                // fall through to migrate
            }
        }
        // Migrate from per-user renderer-ui.json (one-shot). Canonical keys first; theme* aliases.
        // Zoom stay 0 until restore. Blank shell prefs stay blank so HTML seed can merge LS.
        JsonObject ui = RendererUiStore.read();
        Snapshot migrated = build(
                normalizeAppearance(blankTo(
                        firstNonBlank(str(ui, "appearance"), str(ui, "themeAppearance")), "system")),
                normalizeBackground(blankTo(
                        firstNonBlank(str(ui, "background"), str(ui, "themeBackground")), "cool")),
                normalizePrimary(blankTo(
                        firstNonBlank(str(ui, "primary"), str(ui, "themePrimary")), "blue")),
                normalizeUiSkin(blankTo(
                        firstNonBlank(str(ui, "uiSkin"), str(ui, "themeUiSkin")), "classic")),
                normalizeUiFont(firstNonBlank(str(ui, "uiFont"), str(ui, "themeUiFont"))),
                sanitizeUiFontCustom(str(ui, "uiFontCustom")),
                normalizeUiTextScaleId(firstNonBlank(str(ui, "uiTextScale"), str(ui, "themeUiTextScale"))),
                clampUiFontSizePx(asDouble(ui, "uiFontSizePx", 0.0)),
                normalizeUiDensityId(firstNonBlank(str(ui, "uiDensity"), str(ui, "themeUiDensity"))),
                normalizeLocale(firstNonBlank(str(ui, "locale"), null)),
                0.0,
                0,
                "",
                Instant.now().toString()
        );
        persist(migrated);
        return migrated;
    }

    private static Snapshot fromJson(JsonObject obj) {
        // Missing uiFont / uiTextScale / uiDensity stay blank so HTML seed can merge prior localStorage.
        String uiFont = obj.has("uiFont") ? normalizeUiFont(str(obj, "uiFont")) : "";
        String uiTextScale = obj.has("uiTextScale") ? normalizeUiTextScaleId(str(obj, "uiTextScale")) : "";
        String uiDensity = obj.has("uiDensity") ? normalizeUiDensityId(str(obj, "uiDensity")) : "";
        return build(
                normalizeAppearance(blankTo(str(obj, "appearance"), "system")),
                normalizeBackground(blankTo(str(obj, "background"), "cool")),
                normalizePrimary(blankTo(str(obj, "primary"), "blue")),
                normalizeUiSkin(blankTo(str(obj, "uiSkin"), "classic")),
                uiFont,
                sanitizeUiFontCustom(str(obj, "uiFontCustom")),
                uiTextScale,
                clampUiFontSizePx(asDouble(obj, "uiFontSizePx", 0.0)),
                uiDensity,
                normalizeLocale(str(obj, "locale")),
                clampZoom(asDouble(obj, "zoomLevel", 0.0)),
                clampFontSize(asInt(obj, "editorFontSize", 0)),
                normalizeFontFamily(str(obj, "editorFontFamily")),
                blankTo(str(obj, "updatedAt"), Instant.now().toString())
        );
    }

    private static double readLegacyZoom() {
        try {
            JsonObject state = WindowStateStore.read();
            if (state != null && state.has("zoomLevel") && !state.get("zoomLevel").isJsonNull()) {
                return clampZoom(state.get("zoomLevel").getAsDouble());
            }
        } catch (Exception ignored) {
        }
        return 0.0;
    }

    private static Snapshot build(
            String appearance,
            String background,
            String primary,
            String uiSkin,
            String uiFont,
            String uiFontCustom,
            String uiTextScale,
            double uiFontSizePx,
            String uiDensity,
            String locale,
            double zoomLevel,
            int editorFontSize,
            String editorFontFamily,
            String updatedAt
    ) {
        String mode = resolveMode(appearance);
        String editorBg = "dark".equals(mode)
                ? BG_DARK.getOrDefault(background, BG_DARK.get("cool"))
                : BG_LIGHT.getOrDefault(background, BG_LIGHT.get("cool"));
        String chromeBg = "dark".equals(mode)
                ? BG_DARK_RAIL.getOrDefault(background, BG_DARK_RAIL.get("cool"))
                : LIGHT_CHROME;
        String primaryHex = PRIMARY.getOrDefault(primary, PRIMARY.get("blue"));
        String text = "dark".equals(mode) ? "#f0f0f3" : "#111827";
        return new Snapshot(
                appearance,
                background,
                primary,
                uiSkin,
                uiFont == null ? "" : uiFont,
                uiFontCustom == null ? "" : uiFontCustom,
                uiTextScale == null ? "" : uiTextScale,
                uiFontSizePx,
                uiDensity == null ? "" : uiDensity,
                mode,
                chromeBg,
                editorBg,
                text,
                primaryHex,
                locale == null ? "" : locale,
                zoomLevel,
                editorFontSize,
                editorFontFamily == null ? "" : editorFontFamily,
                updatedAt
        );
    }

    private static void persist(Snapshot snap) {
        JsonObject obj = new JsonObject();
        obj.addProperty("appearance", snap.appearance());
        obj.addProperty("background", snap.background());
        obj.addProperty("primary", snap.primary());
        obj.addProperty("uiSkin", snap.uiSkin());
        if (snap.uiFont() != null && !snap.uiFont().isBlank()) {
            obj.addProperty("uiFont", snap.uiFont());
        }
        if (snap.uiFontCustom() != null && !snap.uiFontCustom().isBlank()) {
            obj.addProperty("uiFontCustom", snap.uiFontCustom());
        }
        if (snap.uiTextScale() != null && !snap.uiTextScale().isBlank()) {
            obj.addProperty("uiTextScale", snap.uiTextScale());
        }
        if (snap.uiFontSizePx() > 0) {
            obj.addProperty("uiFontSizePx", snap.uiFontSizePx());
        }
        if (snap.uiDensity() != null && !snap.uiDensity().isBlank()) {
            obj.addProperty("uiDensity", snap.uiDensity());
        }
        obj.addProperty("resolvedMode", snap.resolvedMode());
        obj.addProperty("chromeBg", snap.chromeBg());
        obj.addProperty("editorBg", snap.editorBg());
        obj.addProperty("text", snap.text());
        obj.addProperty("primaryHex", snap.primaryHex());
        if (snap.locale() != null && !snap.locale().isBlank()) {
            obj.addProperty("locale", snap.locale());
        }
        obj.addProperty("zoomLevel", snap.zoomLevel());
        if (snap.editorFontSize() > 0) {
            obj.addProperty("editorFontSize", snap.editorFontSize());
        }
        if (snap.editorFontFamily() != null && !snap.editorFontFamily().isBlank()) {
            obj.addProperty("editorFontFamily", snap.editorFontFamily());
        }
        obj.addProperty("updatedAt", snap.updatedAt());
        try {
            Path path = file();
            Files.createDirectories(path.getParent());
            Files.writeString(path, GSON.toJson(obj), StandardCharsets.UTF_8);
        } catch (Exception e) {
            System.err.println("[datawise-desktop] desktop-chrome write skipped: " + e.getMessage());
        }
    }

    private static String resolveMode(String appearance) {
        if ("dark".equalsIgnoreCase(appearance)) {
            return "dark";
        }
        if ("light".equalsIgnoreCase(appearance)) {
            return "light";
        }
        return SystemThemeUtil.resolveAppearance();
    }

    public static String normalizeUiSkin(String value) {
        return "ide".equalsIgnoreCase(value) ? "ide" : "classic";
    }

    /** Shell UI font id (noto / system / …). Blank input → blank (unset). */
    public static String normalizeUiFont(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String key = value.trim().toLowerCase(Locale.ROOT).replace("_", "").replace("-", "");
        return switch (key) {
            case "noto" -> "noto";
            case "system" -> "system";
            case "segoe" -> "segoe";
            case "yahei" -> "yahei";
            case "pingfang" -> "pingfang";
            case "sourcehan" -> "sourceHan";
            case "harmony", "harmonyos" -> "harmony";
            case "custom" -> "custom";
            default -> "noto";
        };
    }

    /** Custom font family name for uiFont=custom. Blank → blank. */
    public static String sanitizeUiFontCustom(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String cleaned = value.replaceAll("['\";{}\\\\]", "").trim();
        if (cleaned.length() > UI_FONT_CUSTOM_MAX_LEN) {
            cleaned = cleaned.substring(0, UI_FONT_CUSTOM_MAX_LEN);
        }
        return cleaned;
    }

    /**
     * Custom body px when uiTextScale=custom. {@code <=0} or non-finite → {@code 0} (unset).
     * Clamped to 11–18 with 0.5 steps (matches theme-presets.ts).
     */
    public static double clampUiFontSizePx(double value) {
        if (!Double.isFinite(value) || value <= 0) {
            return 0.0;
        }
        double stepped = Math.round(value / UI_FONT_SIZE_PX_STEP) * UI_FONT_SIZE_PX_STEP;
        return Math.max(UI_FONT_SIZE_PX_MIN, Math.min(UI_FONT_SIZE_PX_MAX, stepped));
    }

    /** uiTextScale ladder (includes custom). Blank input → blank (unset). */
    public static String normalizeUiTextScaleId(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return UI_TEXT_SCALE_IDS.contains(trimmed) ? trimmed : "md";
    }

    /** uiDensity ladder (sm/md/lg only). Blank input → blank (unset). */
    public static String normalizeUiDensityId(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return UI_DENSITY_IDS.contains(trimmed) ? trimmed : "md";
    }

    /** @deprecated use {@link #normalizeUiTextScaleId} / {@link #normalizeUiDensityId} */
    public static String normalizeUiScaleId(String value) {
        return normalizeUiTextScaleId(value);
    }

    /** 界面明暗：light / dark / system */
    public static String normalizeAppearance(String value) {
        if (value == null || value.isBlank()) {
            return "system";
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        if ("light".equals(trimmed) || "dark".equals(trimmed) || "system".equals(trimmed)) {
            return trimmed;
        }
        return "system";
    }

    /** 背景色调 */
    public static String normalizeBackground(String value) {
        if (value == null || value.isBlank()) {
            return "cool";
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return BACKGROUNDS.contains(trimmed) ? trimmed : "cool";
    }

    /** 主题色（accent） */
    public static String normalizePrimary(String value) {
        if (value == null || value.isBlank()) {
            return "blue";
        }
        String trimmed = value.trim().toLowerCase(Locale.ROOT);
        return PRIMARY_TONES.contains(trimmed) ? trimmed : "blue";
    }

    public static String normalizeLocale(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        return LOCALES.contains(trimmed) ? trimmed : "";
    }

    public static String normalizeFontFamily(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        return EDITOR_FONTS.contains(trimmed) ? trimmed : "";
    }

    public static double clampZoom(double level) {
        if (!Double.isFinite(level)) {
            return 0.0;
        }
        return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
    }

    public static int clampFontSize(int size) {
        if (size <= 0) {
            return 0;
        }
        return Math.max(EDITOR_FONT_SIZE_MIN, Math.min(EDITOR_FONT_SIZE_MAX, size));
    }

    private static String str(JsonObject data, String key) {
        if (data == null || !data.has(key) || data.get(key).isJsonNull()) {
            return null;
        }
        try {
            String value = data.get(key).getAsString();
            return value == null ? null : value.trim();
        } catch (Exception e) {
            return null;
        }
    }

    private static double asDouble(JsonObject data, String key, double fallback) {
        if (data == null || !data.has(key) || data.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return data.get(key).getAsDouble();
        } catch (Exception e) {
            try {
                return Double.parseDouble(data.get(key).getAsString().trim());
            } catch (Exception e2) {
                return fallback;
            }
        }
    }

    private static int asInt(JsonObject data, String key, int fallback) {
        if (data == null || !data.has(key) || data.get(key).isJsonNull()) {
            return fallback;
        }
        try {
            return data.get(key).getAsInt();
        } catch (Exception e) {
            try {
                return (int) Math.round(Double.parseDouble(data.get(key).getAsString().trim()));
            } catch (Exception e2) {
                return fallback;
            }
        }
    }

    private static String blankTo(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private static String firstNonBlank(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    /** Test hook. */
    static void resetForTests() {
        CACHE.set(null);
        LEGACY_ZOOM_TRIED.set(Boolean.FALSE);
    }
}

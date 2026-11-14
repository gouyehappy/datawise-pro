/** Lazy-load Noto Sans SC variable faces (large) for zh-CN UI. */

let notoSansScLoad: Promise<void> | null = null

export function ensureNotoSansScFont(): Promise<void> {
    if (!notoSansScLoad) {
        notoSansScLoad = import('@fontsource-variable/noto-sans-sc/wght.css').then(() => undefined)
    }
    return notoSansScLoad
}

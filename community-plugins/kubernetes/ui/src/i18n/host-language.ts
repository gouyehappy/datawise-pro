import { addHostEnvListener } from '@/lib/host-bridge'
import i18n from './index'
import { normalizeLocale } from './locale'

type LocaleEvent = { locale?: string }
type LanguageHost = {
  ready: Promise<unknown>
  locale?: string
  getHostInfo?: () => Promise<{ locale?: string }>
  onHostInfo?: (listener: (info: { locale?: string }) => void) => () => void
  onLocaleChange?: (listener: (locale: string) => void) => () => void
  onEvent?: (listener: (event: LocaleEvent) => void) => () => void
}

/** Use the host language at startup and on updates across host bridge versions. */
export function syncHostLanguage(host: LanguageHost): () => void {
  let active = true
  const apply = (locale?: string) => {
    if (!active || !locale) return
    const language = normalizeLocale(locale)
    if (i18n.language !== language) void i18n.changeLanguage(language)
  }
  const offHostInfo = host.onHostInfo?.((info) => apply(info.locale))
  const offLocale = host.onLocaleChange?.(apply)
  const offEvent = host.onEvent?.((event) => apply(event.locale))
  const onEnvironment = (event: Event) => {
    apply((event as CustomEvent<LocaleEvent>).detail?.locale ?? host.locale)
  }
  const offEnv = addHostEnvListener(onEnvironment)
  void host.ready.then(
    () => {
      if (host.getHostInfo) {
        void host.getHostInfo().then((info) => apply(info.locale ?? host.locale)).catch(() => apply(host.locale))
      } else {
        apply(host.locale)
      }
    },
    () => {}
  )
  return () => {
    active = false
    offHostInfo?.()
    offLocale?.()
    offEvent?.()
    offEnv()
  }
}

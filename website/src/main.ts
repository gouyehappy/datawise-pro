import './style.css'
import {dictionaries, type Locale} from './i18n'
import {renderApp} from './content'

const STORAGE_KEY = 'datawise-website-locale'

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'zh' || saved === 'en') return saved
  } catch {
    // ignore
  }
  const lang = navigator.language.toLowerCase()
  return lang.startsWith('zh') ? 'zh' : 'en'
}

function applyMeta(locale: Locale) {
  const d = dictionaries[locale]
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  document.title = d.metaTitle
  const meta = document.querySelector('meta[name="description"]')
  if (meta) meta.setAttribute('content', d.metaDescription)
}

function observeReveals(root: ParentNode) {
  const nodes = root.querySelectorAll('.reveal')
  if (!nodes.length) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    nodes.forEach((el) => el.classList.add('is-visible'))
    return
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        }
      }
    },
    {rootMargin: '0px 0px -8% 0px', threshold: 0.12},
  )
  nodes.forEach((el) => io.observe(el))
}

function bindNav(root: ParentNode, locale: Locale) {
  const nav = root.querySelector<HTMLElement>('[data-nav]')
  const drawer = root.querySelector<HTMLElement>('[data-nav-drawer]')
  const burger = root.querySelector<HTMLButtonElement>('[data-action="toggle-menu"]')
  const d = dictionaries[locale]
  if (!nav) return

  const setSolid = () => {
    const solid = window.scrollY > 48
    nav.classList.toggle('is-solid', solid)
  }
  setSolid()
  window.addEventListener('scroll', setSolid, {passive: true})

  const closeMenu = () => {
    if (!drawer || !burger) return
    drawer.hidden = true
    burger.setAttribute('aria-expanded', 'false')
    burger.setAttribute('aria-label', d.nav.menuOpen)
    document.body.classList.remove('nav-open')
  }

  burger?.addEventListener('click', () => {
    if (!drawer) return
    const open = drawer.hidden
    drawer.hidden = !open
    burger.setAttribute('aria-expanded', open ? 'true' : 'false')
    burger.setAttribute('aria-label', open ? d.nav.menuClose : d.nav.menuOpen)
    document.body.classList.toggle('nav-open', open)
  })

  root.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((link) => {
    link.addEventListener('click', () => closeMenu())
  })

  const sections = [...root.querySelectorAll<HTMLElement>('[data-section]')]
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.nav__link[href^="#"]')]
  if (sections.length && links.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible?.target.id) return
        const id = visible.target.id
        links.forEach((a) => {
          a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`)
        })
      },
      {rootMargin: '-35% 0px -50% 0px', threshold: [0.1, 0.35, 0.6]},
    )
    sections.forEach((s) => spy.observe(s))
  }
}

function mount(locale: Locale) {
  const app = document.querySelector('#app')
  if (!app) return
  applyMeta(locale)
  app.innerHTML = renderApp(dictionaries[locale], locale)
  observeReveals(app)
  bindNav(app, locale)

  app.querySelector('[data-action="toggle-lang"]')?.addEventListener('click', () => {
    const next: Locale = locale === 'zh' ? 'en' : 'zh'
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    const page = app.querySelector('.page')
    page?.classList.add('is-switching')
    window.setTimeout(() => mount(next), 180)
  })
}

mount(detectLocale())

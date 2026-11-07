import type {Dictionary, Locale} from './i18n'
import {LINKS} from './i18n'
import {assetUrl} from './assets'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function brandLetters(brand: string): string {
  return [...brand]
    .map((ch, i) => {
      const safe = ch === ' ' ? '&nbsp;' : escapeHtml(ch)
      return `<span class="hero__char" style="--i:${i}">${safe}</span>`
    })
    .join('')
}

export function renderApp(d: Dictionary, _locale: Locale): string {
  const logo = assetUrl('brand-logo.svg')
  const heroShot = assetUrl('screenshots/03-sql-console.png')
  const docsHref = assetUrl(LINKS.DOCS)

  const featuresHtml = d.features
    .map((f, i) => {
      const reverse = f.reverse ? ' feature--reverse' : ''
      const index = String(i + 1).padStart(2, '0')
      return `
      <article class="feature reveal${reverse}" style="--reveal-delay:${i * 70}ms" id="feature-${escapeHtml(f.id)}">
        <div class="feature__copy">
          <div class="feature__index">${index}</div>
          <h3 class="feature__title">${escapeHtml(f.title)}</h3>
          <p class="feature__body">${escapeHtml(f.body)}</p>
        </div>
        <figure class="feature__media">
          <img src="${escapeHtml(assetUrl(f.image))}" alt="${escapeHtml(f.imageAlt)}" loading="lazy" width="1280" height="800" />
        </figure>
      </article>`
    })
    .join('')

  const connectorItems = d.connectors.names
    .map((n) => `<li class="connector-name">${escapeHtml(n)}</li>`)
    .join('')

  const journeyHtml = d.journey.steps
    .map(
      (step, i) => `
      <li class="journey__step">
        <span class="journey__num">${String(i + 1).padStart(2, '0')}</span>
        <span class="journey__label">${escapeHtml(step.label)}</span>
        <span class="journey__hint">${escapeHtml(step.hint)}</span>
      </li>`,
    )
    .join('')

  const pathsHtml = d.start.paths
    .map((p, i) => {
      const href = p.href.startsWith('http') ? p.href : assetUrl(p.href)
      const external = p.href.startsWith('http')
      return `
      <li class="start-path">
        <span class="start-path__num">${String(i + 1).padStart(2, '0')}</span>
        <h3 class="start-path__title">${escapeHtml(p.title)}</h3>
        <p class="start-path__body">${escapeHtml(p.body)}</p>
        <a class="start-path__link" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(p.linkLabel)} <span aria-hidden="true">→</span></a>
      </li>`
    })
    .join('')

  return `
  <div class="page">
    <div class="bg-atmosphere" aria-hidden="true"></div>

    <header class="nav" data-nav>
      <div class="nav__shell">
        <a class="nav__brand" href="#top">
          <img class="nav__logo" src="${escapeHtml(logo)}" alt="" width="30" height="30" />
          <span class="nav__name">DataWise</span>
        </a>

        <nav class="nav__links" data-nav-panel aria-label="Primary">
          <a class="nav__link" href="#features" data-nav-link>${escapeHtml(d.nav.features)}</a>
          <a class="nav__link" href="#connectors" data-nav-link>${escapeHtml(d.nav.connectors)}</a>
          <a class="nav__link" href="#start" data-nav-link>${escapeHtml(d.nav.start)}</a>
          <a class="nav__link" href="${escapeHtml(docsHref)}">${escapeHtml(d.nav.docs)}</a>
        </nav>

        <div class="nav__actions">
          <button type="button" class="lang-toggle" data-action="toggle-lang" aria-label="Switch language">${escapeHtml(d.nav.langSwitch)}</button>
          <a class="btn btn--ghost nav__github" href="${LINKS.GH}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.nav.github)}</a>
          <a class="btn btn--nav-cta" href="${LINKS.RELEASES}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.nav.download)}</a>
          <button
            type="button"
            class="nav__burger"
            data-action="toggle-menu"
            aria-expanded="false"
            aria-controls="site-menu"
            aria-label="${escapeHtml(d.nav.menuOpen)}"
          >
            <span></span><span></span>
          </button>
        </div>
      </div>
    </header>

    <div class="nav-drawer" id="site-menu" data-nav-drawer hidden>
      <a href="#features" data-nav-link>${escapeHtml(d.nav.features)}</a>
      <a href="#connectors" data-nav-link>${escapeHtml(d.nav.connectors)}</a>
      <a href="#start" data-nav-link>${escapeHtml(d.nav.start)}</a>
      <a href="${escapeHtml(docsHref)}">${escapeHtml(d.nav.docs)}</a>
      <a href="${LINKS.GH}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.nav.github)}</a>
    </div>

    <main id="top">
      <section class="hero" aria-label="Hero">
        <div class="hero__plane" aria-hidden="true">
          <img
            class="hero__shot"
            src="${escapeHtml(heroShot)}"
            alt=""
            width="1600"
            height="1000"
            fetchpriority="high"
          />
          <div class="hero__veil"></div>
          <div class="hero__grain"></div>
        </div>
        <div class="hero__copy">
          <h1 class="hero__brand" aria-label="${escapeHtml(d.hero.brand)}">${brandLetters(d.hero.brand)}</h1>
          <p class="hero__tagline">${escapeHtml(d.hero.tagline)}</p>
          <p class="hero__support">${escapeHtml(d.hero.support)}</p>
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg" href="${LINKS.RELEASES}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.hero.ctaPrimary)}</a>
            <a class="btn btn--ghost btn--lg" href="${escapeHtml(docsHref)}">${escapeHtml(d.hero.ctaSecondary)}</a>
          </div>
        </div>
      </section>

      <section class="statement" aria-hidden="false">
        <p class="statement__line reveal">${escapeHtml(d.statement)}</p>
      </section>

      <section class="journey" aria-label="${escapeHtml(d.journey.heading)}">
        <div class="journey__inner reveal">
          <p class="journey__heading">${escapeHtml(d.journey.heading)}</p>
          <ol class="journey__steps">
            ${journeyHtml}
          </ol>
        </div>
      </section>

      <section class="section features" id="features" data-section>
        <header class="section__head reveal">
          <p class="section__label">${escapeHtml(d.featuresLabel)}</p>
          <h2>${escapeHtml(d.featuresHeading)}</h2>
          <p>${escapeHtml(d.featuresSub)}</p>
        </header>
        <div class="features__list">
          ${featuresHtml}
        </div>
      </section>

      <section class="section section--band" id="connectors" data-section>
        <div class="section__inner">
          <header class="section__head reveal">
            <p class="section__label">${escapeHtml(d.connectors.label)}</p>
            <h2>${escapeHtml(d.connectors.heading)}</h2>
            <p>${escapeHtml(d.connectors.body)}</p>
          </header>
        </div>
        <div class="marquee reveal" aria-hidden="true">
          <ul class="marquee__track" role="presentation">
            ${connectorItems}
            ${connectorItems}
          </ul>
        </div>
        <div class="section__inner">
          <ul class="connector-rail sr-only" role="list">
            ${connectorItems}
          </ul>
        </div>
      </section>

      <section class="section start" id="start" data-section>
        <header class="section__head reveal">
          <p class="section__label">${escapeHtml(d.start.label)}</p>
          <h2>${escapeHtml(d.start.heading)}</h2>
          <p>${escapeHtml(d.start.body)}</p>
        </header>
        <ul class="start-paths reveal" role="list">
          ${pathsHtml}
        </ul>
      </section>
    </main>

    <footer class="footer">
      <div class="footer__brand">
        <img src="${escapeHtml(logo)}" alt="" width="26" height="26" />
        <span>DataWise</span>
        <span class="footer__sep">·</span>
        <span>${escapeHtml(d.footer.rights)}</span>
      </div>
      <div class="footer__links">
        <a href="${LINKS.GH}/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">${escapeHtml(d.footer.license)}</a>
        <a href="${escapeHtml(docsHref)}">${escapeHtml(d.footer.docs)}</a>
        <a href="${LINKS.ISSUES}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.footer.issues)}</a>
        <a href="${LINKS.GH}" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </footer>
  </div>`
}

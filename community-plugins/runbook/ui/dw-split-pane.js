/**
 * Lightweight left|right split for community-plugin iframe UIs.
 * Mirrors host DwSplitPane ratios: sidebar≈22%, third≈33%, half≈50%.
 *
 * Usage:
 *   <div class="dw-split" id="shell">
 *     <aside class="dw-split__start">…</aside>
 *     <div class="dw-split__handle" role="separator" aria-orientation="vertical"></div>
 *     <section class="dw-split__end">…</section>
 *   </div>
 *   <script src="dw-split-pane.js"></script>
 *   <script>DwSplitPane.mount({ root: '#shell', storageKey: 'dw.split.my-plugin', defaultRatio: 'sidebar' })</script>
 *
 * Or convert an existing grid shell:
 *   DwSplitPane.mount({ root: '.shell', start: '.rail', end: '.stage', defaultWidth: 240, storageKey: '…' })
 */
;(function (global) {
  'use strict'

  var RATIOS = { sidebar: 0.22, third: 1 / 3, half: 0.5 }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n))
  }

  function readStored(key) {
    if (!key) return null
    try {
      var raw = localStorage.getItem(key)
      if (!raw) return null
      var n = Number(raw)
      return Number.isFinite(n) ? n : null
    } catch (_) {
      return null
    }
  }

  function writeStored(key, value) {
    if (!key) return
    try {
      localStorage.setItem(key, String(Math.round(value)))
    } catch (_) {
      /* ignore quota / private mode */
    }
  }

  function ensureStyles() {
    if (document.getElementById('dw-split-pane-style')) return
    var style = document.createElement('style')
    style.id = 'dw-split-pane-style'
    style.textContent = [
      '.dw-split{display:flex;flex-direction:row;align-items:stretch;min-width:0;min-height:0;height:100%;width:100%}',
      '.dw-split__start,.dw-split__end{display:flex;flex-direction:column;min-width:0;min-height:0}',
      '.dw-split__start{position:relative;flex:0 0 auto}',
      '.dw-split__end{flex:1 1 auto}',
      '.dw-split__handle{position:relative;z-index:2;flex:0 0 5px;width:5px;align-self:stretch;cursor:col-resize;touch-action:none;background:transparent}',
      '.dw-split__handle::before{content:"";position:absolute;inset:0 -3px}',
      '.dw-split__handle:hover,.dw-split__handle.is-dragging{background:color-mix(in srgb, currentColor 18%, transparent)}',
      '.dw-split--stacked{flex-direction:column}',
      '.dw-split--stacked .dw-split__start{width:auto!important;flex:0 1 38%;min-height:140px;max-height:42%}',
      '.dw-split--stacked .dw-split__handle{display:none}',
      '.dw-split--stacked .dw-split__end{flex:1 1 auto}',
      'body.dw-split-dragging{cursor:col-resize!important;user-select:none!important}',
    ].join('')
    document.head.appendChild(style)
  }

  function resolveRoot(sel) {
    if (!sel) return null
    if (typeof sel === 'string') return document.querySelector(sel)
    return sel
  }

  /**
   * @param {object} opts
   * @param {string|Element} opts.root
   * @param {string|Element} [opts.start]
   * @param {string|Element} [opts.end]
   * @param {string|Element} [opts.handle]
   * @param {string} [opts.storageKey]
   * @param {number} [opts.defaultWidth=260]
   * @param {'sidebar'|'third'|'half'|number} [opts.defaultRatio]
   * @param {number} [opts.minWidth=180]
   * @param {number} [opts.maxWidth=560]
   * @param {number} [opts.maxRatio=0.7]
   * @param {number} [opts.endMinWidth=240]
   * @param {number|false} [opts.stackBelow=720]
   */
  function mount(opts) {
    opts = opts || {}
    ensureStyles()

    var root = resolveRoot(opts.root)
    if (!root) return null

    var start =
      resolveRoot(opts.start) ||
      root.querySelector('.dw-split__start') ||
      root.children[0]
    var end =
      resolveRoot(opts.end) ||
      root.querySelector('.dw-split__end') ||
      root.children[root.children.length - 1]

    if (!start || !end || start === end) return null

    var handle = resolveRoot(opts.handle) || root.querySelector('.dw-split__handle')
    if (!handle) {
      handle = document.createElement('div')
      handle.className = 'dw-split__handle'
      handle.setAttribute('role', 'separator')
      handle.setAttribute('aria-orientation', 'vertical')
      handle.title = 'Drag to resize'
      if (start.nextSibling) root.insertBefore(handle, start.nextSibling)
      else root.appendChild(handle)
      if (handle.nextSibling !== end) root.insertBefore(end, handle.nextSibling)
    }

    root.classList.add('dw-split')
    start.classList.add('dw-split__start')
    end.classList.add('dw-split__end')
    handle.classList.add('dw-split__handle')

    /* Drop grid templates that fight flex */
    root.style.display = 'flex'
    root.style.gridTemplateColumns = 'none'

    var minWidth = opts.minWidth != null ? opts.minWidth : 180
    var maxWidth = opts.maxWidth != null ? opts.maxWidth : 560
    var maxRatio = opts.maxRatio != null ? opts.maxRatio : 0.7
    var endMinWidth = opts.endMinWidth != null ? opts.endMinWidth : 240
    var stackBelow = opts.stackBelow === false ? false : opts.stackBelow != null ? opts.stackBelow : 720
    var storageKey = opts.storageKey || null
    var defaultWidth = opts.defaultWidth != null ? opts.defaultWidth : 260
    var ratio =
      typeof opts.defaultRatio === 'number'
        ? opts.defaultRatio
        : RATIOS[opts.defaultRatio] || null

    var width = readStored(storageKey)
    var dragging = false

    function containerWidth() {
      return Math.round(root.getBoundingClientRect().width) || 0
    }

    function effectiveMax() {
      var cw = containerWidth()
      var fromRatio = cw > 0 ? Math.round(cw * maxRatio) : maxWidth
      var fromEnd = cw > 0 ? Math.max(minWidth, cw - endMinWidth) : maxWidth
      return Math.max(minWidth, Math.min(maxWidth, fromRatio, fromEnd))
    }

    function resolveDefault() {
      var cw = containerWidth()
      if (cw > 0 && ratio != null) {
        return clamp(Math.round(cw * ratio), minWidth, effectiveMax())
      }
      return clamp(defaultWidth, minWidth, effectiveMax())
    }

    function stacked() {
      if (stackBelow === false) return false
      var cw = containerWidth()
      return cw > 0 && cw < stackBelow
    }

    function apply() {
      var isStacked = stacked()
      root.classList.toggle('dw-split--stacked', isStacked)
      if (isStacked) {
        start.style.width = ''
        start.style.flex = ''
        handle.style.display = 'none'
        return
      }
      handle.style.display = ''
      if (width == null) width = resolveDefault()
      width = clamp(width, minWidth, effectiveMax())
      start.style.width = width + 'px'
      start.style.flex = '0 0 auto'
    }

    function onPointerDown(event) {
      if (stacked()) return
      event.preventDefault()
      dragging = true
      handle.classList.add('is-dragging')
      document.body.classList.add('dw-split-dragging')
      var startX = event.clientX
      var startW = start.getBoundingClientRect().width

      function onMove(e) {
        if (!dragging) return
        width = clamp(startW + (e.clientX - startX), minWidth, effectiveMax())
        start.style.width = width + 'px'
      }

      function onUp() {
        dragging = false
        handle.classList.remove('is-dragging')
        document.body.classList.remove('dw-split-dragging')
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        if (width != null) writeStored(storageKey, width)
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    }

    handle.addEventListener('pointerdown', onPointerDown)

    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
    if (ro) ro.observe(root)
    apply()

    return {
      apply: apply,
      destroy: function () {
        handle.removeEventListener('pointerdown', onPointerDown)
        if (ro) ro.disconnect()
        document.body.classList.remove('dw-split-dragging')
      },
    }
  }

  global.DwSplitPane = { mount: mount, RATIOS: RATIOS }
})(typeof window !== 'undefined' ? window : this)

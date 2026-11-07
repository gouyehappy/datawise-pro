/**
 * Sync chrome color onto #dw-open-screen (markup lives in index.html).
 * Cleared when Shell first paints — see desktop-app-mounted.service.ts.
 */
;(function () {
    var LIGHT = '#dce4ee'
    var DARK = '#0c1014'

    function chrome() {
        if (typeof window.__DW_BOOT_CHROME__ === 'string' && window.__DW_BOOT_CHROME__) {
            return window.__DW_BOOT_CHROME__
        }
        return document.documentElement.getAttribute('data-theme') === 'dark' ? DARK : LIGHT
    }

    function paint() {
        var bg = chrome()
        var el = document.getElementById('dw-open-screen')
        if (el) el.style.background = bg
        document.documentElement.style.backgroundColor = bg
        if (document.body) document.body.style.backgroundColor = bg
    }

    window.__datawiseClearOpenScreen = function () {
        var el = document.getElementById('dw-open-screen')
        if (el && el.parentNode) el.parentNode.removeChild(el)
    }

    try {
        paint()
    } catch (e) {}
})()

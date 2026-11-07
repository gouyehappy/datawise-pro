/**
 * Vue 挂载前看门狗：页面重载后若模块脚本失败/挂起，会一直停在 index.html 的 .dw-boot。
 * 触发常见于：休眠唤醒后 Vite/后端瞬断、渲染进程崩溃后恢复、手动 Reload、工作区重启。
 * 本脚本不依赖 Vite 模块图，必须在 type=module 之前以经典脚本加载。
 */
;(function () {
    var AUTO_RELOAD_KEY = 'dw-boot-auto-reload'
    var MOUNT_TIMEOUT_MS = (function () {
        try {
            var override = window.__DW_BOOT_MOUNT_TIMEOUT_MS__
            if (typeof override === 'number' && override > 0) return override
        } catch (_) {
            /* ignore */
        }
        return 18_000
    })()
    var MAX_AUTO_RELOADS = 1
    var mounted = false
    var failShown = false
    var timer = null
    var lastError = ''

    function $(id) {
        return document.getElementById(id)
    }

    function clearAutoReloadCount() {
        try {
            sessionStorage.removeItem(AUTO_RELOAD_KEY)
        } catch (_) {
            /* ignore */
        }
    }

    function readAutoReloadCount() {
        try {
            var raw = sessionStorage.getItem(AUTO_RELOAD_KEY)
            var n = raw == null ? 0 : Number(raw)
            return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
        } catch (_) {
            return 0
        }
    }

    function bumpAutoReloadCount() {
        var next = readAutoReloadCount() + 1
        try {
            sessionStorage.setItem(AUTO_RELOAD_KEY, String(next))
        } catch (_) {
            /* ignore */
        }
        return next
    }

    function markMounted() {
        if (mounted) return
        mounted = true
        window.__DW_APP_MOUNTED__ = true
        clearAutoReloadCount()
        if (timer) {
            clearTimeout(timer)
            timer = null
        }
        var fail = $('dw-boot-fail')
        if (fail) fail.hidden = true
    }

    function showFail(reason) {
        if (mounted || failShown) return
        failShown = true
        var fail = $('dw-boot-fail')
        var detail = $('dw-boot-fail-detail')
        if (!fail) return
        fail.hidden = false
        if (detail) {
            detail.textContent = reason || lastError || '前端脚本未能完成加载'
        }
    }

    function reloadNow() {
        try {
            location.reload()
        } catch (_) {
            location.href = location.href
        }
    }

    function onStuck() {
        if (mounted) return
        var count = readAutoReloadCount()
        if (count < MAX_AUTO_RELOADS) {
            bumpAutoReloadCount()
            reloadNow()
            return
        }
        showFail(lastError || '启动超时：页面已加载但应用未就绪（常见于休眠唤醒或开发服务中断）')
    }

    window.__DW_MARK_MOUNTED__ = markMounted
    window.__DW_APP_MOUNTED__ = false

    window.addEventListener(
        'error',
        function (event) {
            if (mounted) return
            var msg = ''
            if (event && event.message) msg = String(event.message)
            else if (event && event.target && event.target.src) {
                msg = '资源加载失败: ' + event.target.src
            }
            if (msg) lastError = msg
        },
        true,
    )

    window.addEventListener('unhandledrejection', function (event) {
        if (mounted) return
        var reason = event && event.reason
        if (!reason) return
        lastError = reason instanceof Error ? reason.message : String(reason)
    })

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible' || mounted) return
        // 仅在已判定卡住后，休眠唤醒再给一次机会（避免正常慢启动时误 reload）
        var startedAt = window.__DW_BOOT_STARTED_AT__ || Date.now()
        if (!failShown && Date.now() - startedAt < MOUNT_TIMEOUT_MS) return
        if (readAutoReloadCount() >= MAX_AUTO_RELOADS + 1) {
            showFail(lastError || '唤醒后应用仍未就绪')
            return
        }
        bumpAutoReloadCount()
        reloadNow()
    })

    window.__DW_BOOT_STARTED_AT__ = Date.now()
    timer = setTimeout(onStuck, MOUNT_TIMEOUT_MS)

    document.addEventListener('DOMContentLoaded', function () {
        var retry = $('dw-boot-retry')
        if (retry) {
            retry.addEventListener('click', function () {
                clearAutoReloadCount()
                reloadNow()
            })
        }
    })
})()

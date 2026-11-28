#!/usr/bin/env node
/**
 * Arrow-key ops CLI (Clack). Launch: npm run ops:cli
 */
import * as p from '@clack/prompts'
import {GROUPS, actionsByGroup, findAction} from './ops-catalog.mjs'
import {readStatus, runAction} from './ops-runner.mjs'

async function main() {
    if (process.platform === 'win32') {
        try {
            const {spawnSync} = await import('node:child_process')
            spawnSync('cmd', ['/c', 'chcp 65001 >nul'], {stdio: 'ignore', windowsHide: true})
        } catch {
            // ignore
        }
    }

    p.intro('DataWise 操作台（箭头选择）')

    for (;;) {
        const st = readStatus()
        p.note(
            [
                `版本 ${st.version}  ·  分支 ${st.branch}  ·  tag ${st.latestTag}`,
                `工作区 ${st.dirty ? `有 ${st.dirtyCount} 处未存档` : '干净'}`,
                st.weekday ? '今天工作日（上传 Git 可能需紧急确认）' : '今天周末',
                st.hasCnbToken ? '已检测到 CNB_TOKEN' : '未设置 CNB_TOKEN（CNB 相关操作前请先设置）',
            ].join('\n'),
            '当前状态',
        )

        const groupId = await p.select({
            message: '选择功能分类',
            options: [
                ...GROUPS.map((g) => ({value: g.id, label: g.title, hint: g.hint})),
                {value: 'quit', label: '退出'},
            ],
        })
        if (p.isCancel(groupId) || groupId === 'quit') {
            p.outro('已退出。也可双击 ops.bat 打开网页版。')
            break
        }

        const actions = actionsByGroup(groupId)
        const actionId = await p.select({
            message: GROUPS.find((g) => g.id === groupId)?.title || '操作',
            options: [
                ...actions.map((a) => ({value: a.id, label: a.title, hint: a.desc})),
                {value: 'back', label: '← 返回上级'},
            ],
        })
        if (p.isCancel(actionId) || actionId === 'back') continue

        const action = findAction(actionId)
        if (!action) continue

        if (action.confirm) {
            const ok = await p.confirm({
                message: `确认执行：${action.title}？`,
                initialValue: false,
            })
            if (p.isCancel(ok) || !ok) {
                p.log.warn('已取消')
                continue
            }
        }

        // 短命令（stop / status）本窗执行；长命令新窗口
        const useNewWindow = !action.inline
        if (useNewWindow) {
            const {code, newWindow} = await runAction(action.id, {newWindow: true})
            if (newWindow && code === 0) {
                p.log.success(`已在新窗口启动：${action.title}`)
                p.note('请到新窗口查看输出；本菜单可继续选下一项。', '提示')
            } else if (code === 0) {
                p.log.success(`完成：${action.title}`)
            } else {
                p.log.error(`未能启动：${action.title}`)
            }
        } else {
            const spin = p.spinner()
            spin.start(`${action.title}…`)
            let buf = ''
            const {code} = await runAction(action.id, {
                newWindow: false,
                onData: (t) => {
                    buf += t
                },
            })
            if (code === 0) spin.stop(`完成：${action.title}`)
            else spin.stop(`失败（代码 ${code}）：${action.title}`)
            const tail = buf.trim().split(/\r?\n/).slice(-12).join('\n')
            if (tail) p.note(tail.slice(0, 1500), '输出摘要')
        }
    }
}

main().catch((e) => {
    console.error(e.message || e)
    process.exitCode = 1
})

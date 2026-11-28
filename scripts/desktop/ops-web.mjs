#!/usr/bin/env node
/**
 * Local web ops console — Cursor-style settings layout.
 *
 *   npm run ops:web
 *   ops.bat web
 *
 * Opens http://127.0.0.1:3927/ and streams command logs via SSE.
 */
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {ACTIONS, GROUPS, findAction} from './ops-catalog.mjs'
import {readStatus, runAction, ROOT} from './ops-runner.mjs'

const HOST = '127.0.0.1'
const PORT = Number(process.env.OPS_WEB_PORT || 3927)

const jobs = new Map() // id -> {logs: string[], done: boolean, code: number|null}

function htmlPage() {
    const groupsJson = JSON.stringify(GROUPS)
    const actionsJson = JSON.stringify(
        ACTIONS.map((a) => ({
            id: a.id,
            group: a.group,
            title: a.title,
            desc: a.desc,
            confirm: Boolean(a.confirm),
            long: Boolean(a.long),
            inline: Boolean(a.inline),
        })),
    )
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DataWise 设置</title>
<style>
  :root {
    --bg: #0a0a0a;
    --sidebar: #0f0f0f;
    --panel: #121212;
    --row: #141414;
    --row-hover: #1a1a1a;
    --text: #ededed;
    --muted: #8c8c8c;
    --faint: #5c5c5c;
    --accent: #1f8f5f;
    --accent-soft: rgba(31, 143, 95, 0.18);
    --warn: #c9922e;
    --warn-soft: rgba(201, 146, 46, 0.16);
    --danger: #d94c4c;
    --border: #232323;
    --border-soft: #1a1a1a;
    --sidebar-w: 248px;
    --radius: 10px;
    --ease: cubic-bezier(.2,.8,.2,1);
    --search-bg: #151515;
    --shadow: 0 8px 28px rgba(0,0,0,.35);
    --chip-bg: rgba(255,255,255,.03);
    --main-glow: rgba(31,143,95,.07);
    --log-empty: var(--faint);
    --nav-hover: #171717;
    --nav-active: #181818;
    --ico-bg: #1b1b1b;
  }
  html[data-theme="light"] {
    --bg: #f4f4f5;
    --sidebar: #fafafa;
    --panel: #ffffff;
    --row: #ffffff;
    --row-hover: #f6f6f7;
    --text: #171717;
    --muted: #6b6b6b;
    --faint: #9a9a9a;
    --accent: #1a7a52;
    --accent-soft: rgba(26, 122, 82, 0.12);
    --warn: #b07d18;
    --warn-soft: rgba(176, 125, 24, 0.14);
    --danger: #c53d3d;
    --border: #e4e4e7;
    --border-soft: #ececef;
    --search-bg: #ffffff;
    --shadow: 0 8px 24px rgba(20,20,20,.08);
    --chip-bg: #fff;
    --main-glow: rgba(26, 122, 82, 0.06);
    --log-empty: #a1a1aa;
    --nav-hover: #f0f0f1;
    --nav-active: #ececed;
    --ico-bg: #f4f4f5;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: "Segoe UI Variable", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    min-height: 100%;
    -webkit-font-smoothing: antialiased;
  }
  button { font: inherit; }
  .sidebar {
    width: var(--sidebar-w);
    flex-shrink: 0;
    background: var(--sidebar);
    border-right: 1px solid var(--border-soft);
    display: flex;
    flex-direction: column;
    padding: 18px 12px 12px;
  }
  .brand {
    display: flex; align-items: center; gap: 10px;
    padding: 4px 10px 20px;
  }
  .brand-mark {
    width: 28px; height: 28px; border-radius: 8px;
    background: var(--ico-bg);
    border: 1px solid var(--border);
    display: grid; place-items: center;
    font-size: 12px; font-weight: 700; letter-spacing: -0.02em;
  }
  .brand-text { line-height: 1.2; }
  .brand-text strong { display: block; font-size: 14px; font-weight: 650; }
  .brand-text span { color: var(--faint); font-size: 11px; }
  .nav-list { display: flex; flex-direction: column; gap: 2px; }
  .nav-btn {
    position: relative;
    display: flex; align-items: center; gap: 10px;
    width: 100%; text-align: left;
    border: 0; background: transparent; color: var(--muted);
    padding: 9px 12px 9px 14px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 500;
    transition: background .15s var(--ease), color .15s var(--ease);
  }
  .nav-btn::before {
    content: ""; position: absolute; left: 4px; top: 50%;
    width: 2px; height: 0; border-radius: 2px; background: var(--accent);
    transform: translateY(-50%);
    transition: height .15s var(--ease);
  }
  .nav-btn:hover { background: var(--nav-hover); color: var(--text); }
  .nav-btn.active { background: var(--nav-active); color: var(--text); }
  .nav-btn.active::before { height: 14px; }
  .nav-ico {
    width: 22px; height: 22px; border-radius: 6px;
    background: var(--ico-bg); border: 1px solid var(--border);
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0; color: var(--muted);
  }
  .nav-btn.active .nav-ico {
    background: var(--accent-soft); border-color: transparent; color: var(--accent);
  }
  .nav-ico svg { width: 13px; height: 13px; }
  .sidebar-tools {
    margin-top: auto;
    padding: 10px 8px 0;
    border-top: 1px solid var(--border-soft);
    display: flex; flex-direction: column; gap: 8px;
  }
  .theme-btn {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%; border: 1px solid var(--border); background: var(--panel);
    color: var(--text); border-radius: 8px; padding: 8px 10px;
    cursor: pointer; font-size: 12px; font-weight: 600;
  }
  .theme-btn:hover { border-color: #3a3a3a; }
  html[data-theme="light"] .theme-btn:hover { border-color: #d4d4d8; }
  .sidebar-foot {
    padding: 4px 10px 8px;
    color: var(--faint); font-size: 11px; line-height: 1.55;
  }
  .sidebar-foot kbd {
    font-family: inherit; font-size: 10px; color: var(--muted);
    border: 1px solid var(--border); border-radius: 4px; padding: 0 5px;
    background: var(--panel);
  }
  .main {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
    height: 100vh;
    background:
      radial-gradient(900px 420px at 100% -10%, var(--main-glow), transparent 55%),
      var(--bg);
  }
  .top {
    padding: 22px 32px 0;
    border-bottom: 1px solid var(--border-soft);
    backdrop-filter: blur(8px);
  }
  .top-inner { max-width: 920px; }
  .top-head {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  }
  .top h1 {
    margin: 0 0 6px; font-size: 22px; font-weight: 650;
    letter-spacing: -0.02em;
  }
  .top .sub { margin: 0 0 14px; color: var(--muted); font-size: 13px; line-height: 1.5; }
  .search-wrap {
    position: relative; flex-shrink: 0; width: min(260px, 42vw); margin-top: 2px;
  }
  .search-wrap input {
    width: 100%;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    border-radius: 9px;
    padding: 8px 12px 8px 34px;
    font-size: 13px;
    outline: none;
  }
  .search-wrap input:focus { border-color: #3f3f46; box-shadow: 0 0 0 3px rgba(127,127,127,.12); }
  .search-wrap input::placeholder { color: var(--faint); }
  .search-wrap .ico {
    position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
    color: var(--faint); width: 14px; height: 14px; pointer-events: none;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; padding-bottom: 16px; }
  .chip {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--chip-bg);
    border: 1px solid var(--border);
    border-radius: 999px; padding: 6px 12px 6px 10px;
    font-size: 12px; color: var(--muted);
  }
  .chip .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #4a4a4a; flex-shrink: 0;
  }
  .chip.ok .dot { background: #3ecf8e; box-shadow: 0 0 0 3px rgba(62,207,142,.12); }
  .chip.warn .dot { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }
  .chip b { color: var(--text); font-weight: 600; }
  .content {
    flex: 1; overflow: auto; padding: 8px 32px 24px;
  }
  .content-inner {
    max-width: 920px;
    animation: in .22s var(--ease);
  }
  @keyframes in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
  }
  .section-label {
    color: var(--faint); font-size: 11px; font-weight: 600;
    letter-spacing: 0.08em; text-transform: uppercase;
    margin: 18px 0 10px;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 8px;
  }
  .stat {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 14px 12px;
  }
  .stat .k { color: var(--faint); font-size: 11px; margin-bottom: 8px; }
  .stat .v { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
  .stat .v.ok { color: #7ddeb3; }
  .stat .v.warn { color: #e0b35a; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: 0 1px 0 rgba(255,255,255,.02) inset;
  }
  .row {
    display: flex; align-items: center; justify-content: space-between; gap: 18px;
    padding: 15px 16px;
    border-top: 1px solid var(--border-soft);
    background: var(--row);
    transition: background .15s var(--ease);
  }
  .row:first-child { border-top: 0; }
  .row:hover { background: var(--row-hover); }
  .row .meta { min-width: 0; }
  .row .title { font-size: 13.5px; font-weight: 600; letter-spacing: -0.01em; }
  .row .desc { margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.5; }
  .row .actions { flex-shrink: 0; display: flex; gap: 8px; align-items: center; }
  .btn {
    border: 1px solid var(--border); background: #1c1c1c; color: var(--text);
    border-radius: 8px; padding: 7px 13px; font-size: 12.5px; font-weight: 600;
    cursor: pointer; transition: background .15s, border-color .15s, transform .1s;
  }
  .btn:hover { border-color: #333; background: #242424; }
  .btn:active { transform: translateY(1px); }
  .btn.primary {
    background: var(--accent); border-color: transparent; color: #fff;
  }
  .btn.primary:hover { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
  .btn.busy::after {
    content: ""; display: inline-block; width: 10px; height: 10px; margin-left: 8px;
    border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
    border-radius: 50%; vertical-align: -1px;
    animation: spin .7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .badge {
    font-size: 10px; color: var(--muted);
    background: var(--ico-bg); border: 1px solid var(--border);
    border-radius: 999px; padding: 3px 8px;
  }
  html[data-theme="light"] .log { color: #3f3f46; }
  html[data-theme="light"] .stat .v.ok { color: #15803d; }
  html[data-theme="light"] .stat .v.warn { color: #b45309; }
  .log-panel {
    border-top: 1px solid var(--border);
    background: var(--bg);
    height: var(--log-h, 220px);
    min-height: 120px;
    display: flex; flex-direction: column;
    position: relative;
  }
  .log-panel.collapsed { height: 42px; min-height: 42px; }
  .log-panel.collapsed .log,
  .log-panel.collapsed .log-resizer { display: none; }
  .log-resizer {
    position: absolute; top: -3px; left: 0; right: 0; height: 6px;
    cursor: ns-resize; z-index: 2;
  }
  .log-resizer:hover, .log-resizer.dragging {
    background: linear-gradient(to bottom, transparent, rgba(127,127,127,.25), transparent);
  }
  .log-bar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 14px; height: 42px; color: var(--muted); font-size: 12px;
    border-bottom: 1px solid var(--border-soft);
    flex-shrink: 0;
    background: var(--panel);
  }
  .log-bar .left { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .log-bar .pulse {
    width: 8px; height: 8px; border-radius: 50%; background: #3a3a3a;
  }
  .log-bar .pulse.on {
    background: #3ecf8e;
    box-shadow: 0 0 0 3px rgba(62,207,142,.15);
    animation: pulse 1.4s ease infinite;
  }
  .log-bar .pulse.err { background: var(--danger); box-shadow: 0 0 0 3px rgba(217,76,76,.15); animation: none; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: .45; }
  }
  .log-bar .label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log-bar .right { display: flex; gap: 6px; }
  .log-bar button {
    background: transparent; border: 1px solid var(--border); color: var(--muted);
    border-radius: 6px; padding: 3px 9px; cursor: pointer; font-size: 11.5px;
  }
  .log-bar button:hover { color: var(--text); border-color: #333; }
  .log {
    flex: 1; overflow: auto; padding: 12px 16px;
    font-family: "Cascadia Mono", "Sarasa Mono SC", Consolas, ui-monospace, monospace;
    font-size: 12px; line-height: 1.5; white-space: pre-wrap; color: #bdbdbd;
  }
  .log:empty::before {
    content: "运行操作后，输出会出现在这里。长任务会同时打开新终端窗口。";
    color: var(--log-empty);
  }
  .empty-filter {
    padding: 28px 16px; text-align: center; color: var(--muted); font-size: 13px;
  }
  .nav-btn .count {
    margin-left: auto; font-size: 10px; color: var(--faint);
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 999px; min-width: 18px; text-align: center; padding: 0 5px;
  }
  @media (max-width: 900px) {
    .stat-grid { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 760px) {
    body { flex-direction: column; }
    .sidebar { width: 100%; border-right: 0; border-bottom: 1px solid var(--border); }
    .main { height: auto; min-height: 70vh; }
    .nav-list { display: flex; flex-direction: row; flex-wrap: wrap; gap: 4px; }
    .nav-btn::before { display: none; }
    .stat-grid { grid-template-columns: 1fr; }
    .content, .top { padding-left: 16px; padding-right: 16px; }
  }
</style>
</head>
<body>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">DW</div>
      <div class="brand-text"><strong>DataWise</strong><span>本地设置台</span></div>
    </div>
    <div class="nav-list" id="nav"></div>
    <div class="sidebar-tools">
      <button type="button" class="theme-btn" id="themeBtn" title="切换深浅色">
        <span id="themeLabel">深色主题</span><span>切换</span>
      </button>
      <div class="sidebar-foot">
        终端菜单：双击 <kbd>ops.bat</kbd><br/>
        本页：<kbd>ops.bat web</kbd><br/>
        关闭：关终端或 <kbd>ops-close.bat</kbd>
      </div>
    </div>
  </aside>
  <div class="main">
    <div class="top">
      <div class="top-inner">
        <div class="top-head">
          <div>
            <h1 id="pageTitle">概览</h1>
            <p class="sub" id="pageHint">查看当前仓库状态，再从左侧进入具体操作。</p>
          </div>
          <div class="search-wrap">
            <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
            <input id="search" type="search" placeholder="搜索操作…  /" autocomplete="off" spellcheck="false" />
          </div>
        </div>
        <div class="chips" id="chips">加载中…</div>
      </div>
    </div>
    <div class="content"><div class="content-inner" id="content"></div></div>
    <div class="log-panel" id="logPanel">
      <div class="log-resizer" id="logResizer" title="拖拽调整高度"></div>
      <div class="log-bar">
        <div class="left">
          <span class="pulse" id="jobPulse"></span>
          <span class="label" id="jobLabel">等待操作</span>
        </div>
        <div class="right">
          <button type="button" id="toggleLog">收起</button>
          <button type="button" id="clearLog">清空</button>
        </div>
      </div>
      <div class="log" id="log"></div>
    </div>
  </div>
<script>
const GROUPS = ${groupsJson};
const ACTIONS = ${actionsJson};
const SVG = {
  overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>',
  release: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5-5 5 5"/><path d="M5 19h14"/></svg>',
  dev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6l-5 6 5 6"/><path d="M16 6l5 6-5 6"/></svg>',
  build: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  quality: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 7L10 17l-5-5"/></svg>',
  plugins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v6"/><path d="M12 15v6"/><path d="M3 12h6"/><path d="M15 12h6"/><circle cx="12" cy="12" r="3"/></svg>',
};
let busy = false;
let active = 'overview';
let lastStatus = null;
let jobState = 'idle'; // idle | run | ok | err
let query = '';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function setJobUi(state, text) {
  jobState = state;
  const pulse = document.getElementById('jobPulse');
  pulse.className = 'pulse' + (state === 'run' ? ' on' : state === 'err' ? ' err' : state === 'ok' ? ' on' : '');
  document.getElementById('jobLabel').textContent = text;
}

function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('dw-ops-theme', t);
  document.getElementById('themeLabel').textContent = t === 'light' ? '浅色主题' : '深色主题';
}

function matchQuery(a) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (a.title + ' ' + a.desc + ' ' + a.id).toLowerCase().includes(q);
}

async function refreshStatus() {
  const r = await fetch('/api/status');
  lastStatus = await r.json();
  const s = lastStatus;
  const chips = [
    ['版本', s.version, ''],
    ['分支', s.branch, ''],
    ['标记', s.latestTag, ''],
    ['改动', s.dirty ? (s.dirtyCount + ' 处未存档') : '干净', s.dirty ? 'warn' : 'ok'],
    ['今天', s.weekday ? '工作日' : '周末', s.weekday ? 'warn' : 'ok'],
    ['CNB', s.hasCnbToken ? '令牌已设置' : '未设置令牌', s.hasCnbToken ? 'ok' : 'warn'],
  ];
  document.getElementById('chips').innerHTML = chips.map(([k,v,cls]) =>
    '<div class="chip '+cls+'"><span class="dot"></span>'+esc(k)+' <b>'+esc(v)+'</b></div>'
  ).join('');
  if (active === 'overview') renderContent();
}

function renderNav() {
  const nav = document.getElementById('nav');
  const items = [{id:'overview', title:'概览'}].concat(GROUPS);
  nav.innerHTML = items.map(g => {
    const count = g.id === 'overview' ? 0 : ACTIONS.filter(a => a.group === g.id && matchQuery(a)).length;
    const showCount = query && g.id !== 'overview';
    return '<button type="button" class="nav-btn'+(active===g.id?' active':'')+'" data-id="'+g.id+'">' +
      '<span class="nav-ico">'+(SVG[g.id]||SVG.overview)+'</span>'+esc(g.title) +
      (showCount ? '<span class="count">'+count+'</span>' : '') +
      '</button>';
  }).join('');
  nav.querySelectorAll('.nav-btn').forEach(btn => {
    btn.onclick = () => { active = btn.dataset.id; render(); };
  });
}

function renderActionRows(acts) {
  if (!acts.length) {
    return '<div class="card"><div class="empty-filter">没有匹配「'+esc(query)+'」的操作</div></div>';
  }
  return '<div class="card">' + acts.map(a =>
    '<div class="row">' +
      '<div class="meta"><div class="title">'+esc(a.title)+'</div><div class="desc">'+esc(a.desc)+'</div></div>' +
      '<div class="actions">' +
        (a.long ? '<span class="badge">较久</span>' : '') +
        (a.inline ? '<span class="badge">本页</span>' : '') +
        '<button class="btn primary'+(busy?' busy':'')+'" data-id="'+esc(a.id)+'" type="button"'+(busy?' disabled':'')+'>运行</button>' +
      '</div></div>'
  ).join('') + '</div>';
}

function renderContent() {
  const content = document.getElementById('content');
  if (query && active === 'overview') {
    document.getElementById('pageTitle').textContent = '搜索结果';
    document.getElementById('pageHint').textContent = '在全部操作中匹配「' + query + '」';
    const acts = ACTIONS.filter(matchQuery);
    content.innerHTML = '<div class="section-label">找到 '+acts.length+' 项</div>' + renderActionRows(acts);
    content.querySelectorAll('button[data-id]').forEach(btn => {
      btn.onclick = () => run(btn.dataset.id);
    });
    return;
  }
  if (active === 'overview') {
    document.getElementById('pageTitle').textContent = '概览';
    document.getElementById('pageHint').textContent = '先看状态，再从左侧进入发版 / 开发 / 编译等分类。也可按 / 搜索。';
    const s = lastStatus || {};
    const dirtyCls = s.dirty ? 'warn' : 'ok';
    const cnbCls = s.hasCnbToken ? 'ok' : 'warn';
    content.innerHTML =
      '<div class="stat-grid">' +
        '<div class="stat"><div class="k">软件版本</div><div class="v">'+esc(s.version||'—')+'</div></div>' +
        '<div class="stat"><div class="k">工作区</div><div class="v '+dirtyCls+'">'+(s.dirty ? esc((s.dirtyCount||0)+' 处未存档') : '干净')+'</div></div>' +
        '<div class="stat"><div class="k">CNB 令牌</div><div class="v '+cnbCls+'">'+(s.hasCnbToken ? '已就绪' : '未设置')+'</div></div>' +
      '</div>' +
      '<div class="section-label">常用入口</div><div class="card">' +
      [
        ['release','发版与 CNB','升版本、推代码、镜像安装包'],
        ['dev','开发联调','启动 / 停止本机环境'],
        ['build','编译打包','前后端与安装包'],
        ['quality','质量检查','类型检查、门禁、对齐'],
      ].map(([id,t,d]) =>
        '<div class="row"><div class="meta"><div class="title">'+esc(t)+'</div><div class="desc">'+esc(d)+'</div></div>' +
        '<div class="actions"><button class="btn" data-go="'+id+'" type="button">打开</button></div></div>'
      ).join('') + '</div>';
    content.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { active = b.dataset.go; render(); });
    return;
  }
  const g = GROUPS.find(x => x.id === active);
  document.getElementById('pageTitle').textContent = g ? g.title : active;
  document.getElementById('pageHint').textContent = g ? g.hint : '';
  const acts = ACTIONS.filter(a => a.group === active && matchQuery(a));
  content.innerHTML =
    '<div class="section-label">'+(query ? ('筛选结果 · '+acts.length) : '操作')+'</div>' +
    renderActionRows(acts);
  content.querySelectorAll('button[data-id]').forEach(btn => {
    btn.onclick = () => run(btn.dataset.id);
  });
}

function render() {
  renderNav();
  renderContent();
}

function appendLog(t) {
  const log = document.getElementById('log');
  log.textContent += t;
  log.scrollTop = log.scrollHeight;
  document.getElementById('logPanel').classList.remove('collapsed');
  document.getElementById('toggleLog').textContent = '收起';
}

async function run(id) {
  if (busy) return;
  const action = ACTIONS.find(a => a.id === id);
  if (!action) return;
  if (action.confirm && !confirm('确认执行：\\n' + action.title + '\\n\\n' + action.desc)) return;
  busy = true;
  render();
  setJobUi('run', '正在执行：' + action.title);
  document.getElementById('log').textContent = '';
  let code = 1;
  try {
    const r = await fetch('/api/run', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ id }),
    });
    const { jobId } = await r.json();
    await new Promise((resolve) => {
      const es = new EventSource('/api/logs?job=' + encodeURIComponent(jobId));
      es.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'log') appendLog(msg.text);
        if (msg.type === 'done') {
          code = msg.code;
          appendLog('\\n—— 结束，退出码 ' + msg.code + ' ——\\n');
          es.close();
          resolve();
        }
      };
      es.onerror = () => { es.close(); resolve(); };
    });
  } catch (e) {
    appendLog(String(e));
    code = 1;
  }
  setJobUi(code === 0 ? 'ok' : 'err', (code === 0 ? '完成：' : '失败：') + action.title);
  busy = false;
  render();
  refreshStatus();
}

document.getElementById('clearLog').onclick = () => {
  document.getElementById('log').textContent = '';
  setJobUi('idle', '等待操作');
};
document.getElementById('toggleLog').onclick = () => {
  const p = document.getElementById('logPanel');
  const on = p.classList.toggle('collapsed');
  document.getElementById('toggleLog').textContent = on ? '展开' : '收起';
  if (!on) {
    const h = Number(localStorage.getItem('dw-ops-log-h') || 220);
    p.style.setProperty('--log-h', Math.max(120, h) + 'px');
  }
};

// Theme
applyTheme(localStorage.getItem('dw-ops-theme') || 'dark');
document.getElementById('themeBtn').onclick = () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'light' ? 'dark' : 'light');
};

// Search
const searchEl = document.getElementById('search');
searchEl.addEventListener('input', () => {
  query = searchEl.value.trim();
  render();
});
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchEl && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    searchEl.focus();
    searchEl.select();
  }
  if (e.key === 'Escape' && document.activeElement === searchEl) {
    searchEl.blur();
    if (query) { query = ''; searchEl.value = ''; render(); }
  }
});

// Log resize
(() => {
  const panel = document.getElementById('logPanel');
  const handle = document.getElementById('logResizer');
  const saved = Number(localStorage.getItem('dw-ops-log-h') || 220);
  panel.style.setProperty('--log-h', Math.max(120, Math.min(480, saved)) + 'px');
  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (panel.classList.contains('collapsed')) return;
    dragging = true;
    handle.classList.add('dragging');
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = panel.parentElement.getBoundingClientRect();
    const h = Math.max(120, Math.min(Math.floor(rect.bottom - e.clientY), Math.floor(window.innerHeight * 0.55)));
    panel.style.setProperty('--log-h', h + 'px');
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    const h = getComputedStyle(panel).getPropertyValue('--log-h').replace('px','').trim();
    localStorage.setItem('dw-ops-log-h', String(h || 220));
  });
})();

render();
refreshStatus();
setInterval(refreshStatus, 15000);
</script>
</body>
</html>`
}

function openBrowser(url) {
    const isWin = process.platform === 'win32'
    if (isWin) {
        spawn('cmd', ['/c', 'start', '', url], {detached: true, stdio: 'ignore', windowsHide: true}).unref()
    } else if (process.platform === 'darwin') {
        spawn('open', [url], {detached: true, stdio: 'ignore'}).unref()
    } else {
        spawn('xdg-open', [url], {detached: true, stdio: 'ignore'}).unref()
    }
}

function startJob(actionId) {
    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const job = {logs: [], done: false, code: null, listeners: new Set()}
    jobs.set(jobId, job)
    const push = (text) => {
        job.logs.push(text)
        for (const fn of job.listeners) fn({type: 'log', text})
    }
    const action = findAction(actionId)
    // 长任务可新开终端；短任务/本页任务走 SSE 日志
    const useNewWindow = Boolean(action?.long) && !action?.inline
    runAction(actionId, {onData: push, newWindow: useNewWindow}).then(({code, newWindow}) => {
        if (newWindow) {
            push('\n[DataWise] 已在新终端窗口启动，请到新窗口查看完整输出。\n')
        }
        job.done = true
        job.code = code
        for (const fn of job.listeners) fn({type: 'done', code})
        setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000)
    })
    return jobId
}

function sendJson(res, code, obj) {
    res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(obj))
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

    if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'})
        res.end(htmlPage())
        return
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
        sendJson(res, 200, readStatus())
        return
    }
    if (req.method === 'GET' && url.pathname === '/api/catalog') {
        sendJson(res, 200, {groups: GROUPS, actions: ACTIONS})
        return
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
        let body = ''
        for await (const chunk of req) body += chunk
        let id = ''
        try {
            id = JSON.parse(body || '{}').id
        } catch {
            sendJson(res, 400, {error: 'bad json'})
            return
        }
        if (!findAction(id)) {
            sendJson(res, 404, {error: 'unknown action'})
            return
        }
        const jobId = startJob(id)
        sendJson(res, 200, {jobId})
        return
    }
    if (req.method === 'GET' && url.pathname === '/api/logs') {
        const jobId = url.searchParams.get('job')
        const job = jobs.get(jobId)
        if (!job) {
            sendJson(res, 404, {error: 'job not found'})
            return
        }
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        })
        const send = (obj) => {
            res.write(`data: ${JSON.stringify(obj)}\n\n`)
        }
        for (const text of job.logs) send({type: 'log', text})
        if (job.done) {
            send({type: 'done', code: job.code})
            res.end()
            return
        }
        const listener = (msg) => {
            send(msg)
            if (msg.type === 'done') {
                job.listeners.delete(listener)
                res.end()
            }
        }
        job.listeners.add(listener)
        req.on('close', () => job.listeners.delete(listener))
        return
    }

    res.writeHead(404)
    res.end('Not found')
})

server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}/`
    console.log('')
    console.log('DataWise 设置台（网页）已启动')
    console.log(`  ${url}`)
    console.log(`  仓库: ${ROOT}`)
    console.log('  关闭本窗口即停止服务；也可 ops-close.bat')
    console.log('')
    if (process.env.OPS_WEB_NO_OPEN !== '1') {
        openBrowser(url)
    }
})

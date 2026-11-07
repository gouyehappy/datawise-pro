export function formatBytes(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function formatPercent(n: number | undefined | null, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

export function formatUptime(sec: number | undefined | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function sparklinePath(samples: { value: number }[], width = 120, height = 28): string {
  if (!samples.length) return '';
  const values = samples.map((s) => s.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  return samples
    .map((s, i) => {
      const x = samples.length === 1 ? 0 : (i / (samples.length - 1)) * width;
      const y = height - ((s.value - min) / span) * (height - 2) - 1;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Shorten long Windows/Unix paths for dense tables; full string stays in title. */
export function shortPath(s: string | undefined | null, max = 56): string {
  if (!s) return '—';
  const t = s.trim();
  if (t.length <= max) return t;
  const parts = t.split(/[\\/]/);
  const base = parts[parts.length - 1] || t;
  if (base.length >= max - 3) return base.slice(0, max - 1) + '…';
  const head = t.slice(0, Math.max(8, max - base.length - 5));
  return `${head}…${base}`;
}

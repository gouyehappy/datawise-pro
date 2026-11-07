import { useState } from 'react'
import { EuiSelect } from '@elastic/eui'
import moment from 'moment'
import type { HistBucket } from '../lib/types'

type Props = {
  buckets: HistBucket[]
  timeField?: string
  fromTime?: string
  toTime?: string
}

/** OSD Discover-compatible interval labels (display; Auto uses backend bucket size). */
const INTERVAL_OPTIONS = [
  { value: 'auto', text: 'Auto' },
  { value: 'ms', text: 'Millisecond' },
  { value: 's', text: 'Second' },
  { value: 'm', text: 'Minute' },
  { value: 'h', text: 'Hourly' },
  { value: 'd', text: 'Daily' },
  { value: 'w', text: 'Weekly' },
  { value: 'M', text: 'Monthly' },
  { value: 'y', text: 'Yearly' },
]

export function Histogram({
  buckets,
  timeField = '@timestamp',
  fromTime,
  toTime,
}: Props) {
  const [interval, setInterval] = useState('auto')

  if (!buckets.length) {
    return (
      <div className="dscHistogram">
        <div className="dscHistogram__empty">No results match your search criteria</div>
      </div>
    )
  }

  const max = Math.max(...buckets.map((b) => b.docCount), 1)
  const yTicks = buildYTicks(max)
  const intervalHint = inferIntervalLabel(buckets)
  const rangeLabel = formatRange(fromTime, toTime, buckets)

  const plotW = Math.max(buckets.length * 10, 520)
  const plotH = 100
  const padL = 36
  const padR = 8
  const padT = 8
  const padB = 22
  const innerW = plotW - padL - padR
  const innerH = plotH - padT - padB
  const barGap = 1
  const barW = Math.max(2, innerW / buckets.length - barGap)

  const xLabels = pickXLabels(buckets, 6)

  return (
    <div className="dscHistogram">
      <div className="dscHistogram__toolbar">
        <span className="dscHistogram__range">{rangeLabel}</span>
        <EuiSelect
          compressed
          className="dscHistogram__interval"
          options={INTERVAL_OPTIONS}
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          aria-label="Histogram interval"
          fullWidth={false}
        />
      </div>
      <div className="dscHistogram__frame">
        <svg
          className="dscHistogram__chart"
          viewBox={`0 0 ${plotW} ${plotH}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Discover histogram"
        >
          {yTicks.map((t) => {
            const y = padT + innerH * (1 - t / max)
            return (
              <g key={t}>
                <line
                  x1={padL}
                  x2={plotW - padR}
                  y1={y}
                  y2={y}
                  className="dscHistogram__grid"
                />
                <text x={padL - 4} y={y + 3} textAnchor="end" className="dscHistogram__tick">
                  {formatY(t)}
                </text>
              </g>
            )
          })}
          <text
            x={10}
            y={padT + innerH / 2}
            className="dscHistogram__axisTitle"
            transform={`rotate(-90 10 ${padT + innerH / 2})`}
            textAnchor="middle"
          >
            Count
          </text>
          {buckets.map((b, i) => {
            const bh = ((b.docCount || 0) / max) * innerH
            const x = padL + i * (barW + barGap)
            const y = padT + innerH - bh
            return (
              <rect
                key={i}
                className="dscHistogram__bar"
                x={x}
                y={y}
                width={barW}
                height={Math.max(bh, b.docCount > 0 ? 2 : 0)}
              >
                <title>{`${b.keyAsString || b.key || ''} — ${b.docCount}`}</title>
              </rect>
            )
          })}
          {xLabels.map(({ i, label }) => {
            const x = padL + i * (barW + barGap) + barW / 2
            return (
              <text key={i} x={x} y={plotH - 6} textAnchor="middle" className="dscHistogram__tick">
                {label}
              </text>
            )
          })}
        </svg>
      </div>
      <div className="dscHistogram__xLabel">
        {timeField} per {intervalHint}
      </div>
    </div>
  )
}

function buildYTicks(max: number): number[] {
  if (max <= 1) return [0, 1]
  if (max <= 5) return [0, 1, 2, 3, 4, 5].filter((n) => n <= max)
  const step = niceStep(max / 4)
  const ticks: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks[ticks.length - 1] < max) ticks.push(max)
  return ticks
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))))
  const n = raw / pow
  if (n <= 1) return pow
  if (n <= 2) return 2 * pow
  if (n <= 5) return 5 * pow
  return 10 * pow
}

function formatY(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`
  return String(n)
}

function formatRange(fromTime?: string, toTime?: string, buckets?: HistBucket[]): string {
  const fmt = (s?: string) => {
    if (!s) return ''
    const m = moment(s)
    return m.isValid() ? m.format('MMM D, YYYY @ HH:mm:ss.SSS') : s
  }
  if (fromTime && toTime) return `${fmt(fromTime)} - ${fmt(toTime)}`
  if (buckets && buckets.length) {
    const a = buckets[0].keyAsString || String(buckets[0].key || '')
    const b = buckets[buckets.length - 1].keyAsString || String(buckets[buckets.length - 1].key || '')
    return `${fmt(a)} - ${fmt(b)}`
  }
  return ''
}

function pickXLabels(
  buckets: HistBucket[],
  count: number,
): Array<{ i: number; label: string }> {
  if (!buckets.length) return []
  const step = Math.max(1, Math.floor((buckets.length - 1) / Math.max(count - 1, 1)))
  const out: Array<{ i: number; label: string }> = []
  for (let i = 0; i < buckets.length; i += step) {
    const raw = buckets[i].keyAsString || String(buckets[i].key || '')
    const m = moment(raw)
    out.push({ i, label: m.isValid() ? m.format('HH:mm') : String(i) })
  }
  const last = buckets.length - 1
  if (out[out.length - 1]?.i !== last) {
    const raw = buckets[last].keyAsString || String(buckets[last].key || '')
    const m = moment(raw)
    out.push({ i: last, label: m.isValid() ? m.format('HH:mm') : '' })
  }
  return out
}

function inferIntervalLabel(buckets: HistBucket[]): string {
  if (buckets.length < 2) return 'bucket'
  const a = Number(buckets[0].key)
  const b = Number(buckets[1].key)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 'bucket'
  const ms = Math.abs(b - a)
  if (ms <= 40_000) return '30 seconds'
  if (ms <= 90_000) return '1 minute'
  if (ms <= 6 * 60_000) return '5 minutes'
  if (ms <= 40 * 60_000) return '30 minutes'
  if (ms <= 4 * 3600_000) return '3 hours'
  if (ms <= 14 * 3600_000) return '12 hours'
  return 'day'
}

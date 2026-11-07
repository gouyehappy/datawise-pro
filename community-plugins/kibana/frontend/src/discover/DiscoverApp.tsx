import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EuiFieldText,
  EuiLoadingSpinner,
  EuiSuperDatePicker,
  type OnRefreshChangeProps,
  type OnTimeChangeProps,
} from '@elastic/eui'
import datemath from '@elastic/datemath'
import {
  connectionIdFrom,
  defaultIndexFrom,
  errorText,
  getBridge,
  listIndices,
  searchLogs,
  totalHits,
} from '../lib/bridge'
import {
  buildSearchQuery,
  removeFilter,
  upsertFilter,
  type DiscoverFilter,
} from '../lib/filters'
import type { HostContext, IndexInfo, SearchResult } from '../lib/types'
import { AddFilterPopover } from './AddFilterPopover'
import { FieldSidebar } from './FieldSidebar'
import { FilterBar } from './FilterBar'
import { Histogram } from './Histogram'
import { DocTable } from './DocTable'
import './discover.css'

const QUICK_RANGES = [
  { start: 'now/d', end: 'now', label: 'Today' },
  { start: 'now-15m', end: 'now', label: 'Last 15 minutes' },
  { start: 'now-30m', end: 'now', label: 'Last 30 minutes' },
  { start: 'now-1h', end: 'now', label: 'Last 1 hour' },
  { start: 'now-24h', end: 'now', label: 'Last 24 hours' },
  { start: 'now-7d', end: 'now', label: 'Last 7 days' },
  { start: 'now-30d', end: 'now', label: 'Last 30 days' },
]

function resolveRange(start: string, end: string): { fromTime: string; toTime: string } {
  const from = datemath.parse(start)
  const to = datemath.parse(end, { roundUp: true })
  return {
    fromTime: (from && from.isValid() ? from : datemath.parse('now-15m')!).toISOString(),
    toTime: (to && to.isValid() ? to : datemath.parse('now')!).toISOString(),
  }
}

export function DiscoverApp() {
  const [context, setContext] = useState<HostContext>({})
  const [bridgeError, setBridgeError] = useState('')
  const [indices, setIndices] = useState<IndexInfo[]>([])
  const [indexPattern, setIndexPattern] = useState('')
  const [query, setQuery] = useState('')
  const [draftQuery, setDraftQuery] = useState('')
  const [filters, setFilters] = useState<DiscoverFilter[]>([])
  const [start, setStart] = useState('now-15m')
  const [end, setEnd] = useState('now')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [refreshInterval, setRefreshInterval] = useState(0)
  const [isPaused, setIsPaused] = useState(true)
  const connectionId = connectionIdFrom(context)
  const connectionLabel =
    context.connectionName || context.connection?.name || connectionId || ''

  const effectiveQuery = useMemo(
    () => buildSearchQuery(query, filters),
    [query, filters],
  )

  useEffect(() => {
    const b = getBridge()
    if (!b) {
      setBridgeError('请通过 DataWise 工作台打开此插件（Host Bridge 不可用）')
      return
    }
    let alive = true
    const onCtx = (ctx: HostContext) => {
      if (alive) setContext(ctx || {})
    }
    const off = b.onContextChange?.(onCtx) || b.onContext?.(onCtx)
    b.ready
      .then(() => {
        if (alive) setContext(b.context || {})
      })
      .catch((e) => {
        if (alive) setBridgeError(errorText(e))
      })
    return () => {
      alive = false
      off?.()
    }
  }, [])

  useEffect(() => {
    if (!connectionId) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await listIndices(connectionId)
        if (cancelled) return
        setIndices(list)
        const preferred = defaultIndexFrom(context) || list[0]?.name || 'logs-*'
        setIndexPattern((prev) => prev || preferred)
      } catch (e) {
        if (!cancelled) setError(errorText(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connectionId, context])

  const runSearch = useCallback(async () => {
    if (!connectionId || !indexPattern) return
    setIsLoading(true)
    setError('')
    try {
      const { fromTime, toTime } = resolveRange(start, end)
      const res = await searchLogs(connectionId, {
        index: indexPattern,
        query: effectiveQuery || '*',
        fromTime,
        toTime,
        timeField: '@timestamp',
        size: 100,
        sortOrder: 'desc',
      })
      setResult(res)
    } catch (e) {
      setError(errorText(e))
      setResult(null)
    } finally {
      setIsLoading(false)
    }
  }, [connectionId, indexPattern, effectiveQuery, start, end])

  useEffect(() => {
    if (connectionId && indexPattern) void runSearch()
  }, [connectionId, indexPattern, effectiveQuery, start, end, runSearch])

  useEffect(() => {
    if (isPaused || refreshInterval <= 0) return
    const id = window.setInterval(() => void runSearch(), refreshInterval)
    return () => window.clearInterval(id)
  }, [isPaused, refreshInterval, runSearch])

  const onTimeChange = ({ start: s, end: e, isInvalid }: OnTimeChangeProps) => {
    if (isInvalid) return
    setStart(s)
    setEnd(e)
  }

  const onRefreshChange = ({
    isPaused: paused,
    refreshInterval: interval,
  }: OnRefreshChangeProps) => {
    setIsPaused(paused)
    setRefreshInterval(interval)
  }

  const submitQuery = () => setQuery(draftQuery)

  const onAddFilter = useCallback((field: string, value: string, negate: boolean) => {
    setFilters((prev) => upsertFilter(prev, field, value, negate))
  }, [])

  const onRemoveFilter = useCallback((id: string) => {
    setFilters((prev) => removeFilter(prev, id))
  }, [])

  const onToggleNegate = useCallback((id: string) => {
    setFilters((prev) => {
      const cur = prev.find((f) => f.id === id)
      if (!cur) return prev
      return upsertFilter(
        prev.filter((f) => f.id !== id),
        cur.field,
        cur.value,
        !cur.negate,
      )
    })
  }, [])

  const onNew = () => {
    setDraftQuery('')
    setQuery('')
    setFilters([])
    setSelectedFields([])
    setStart('now-15m')
    setEnd('now')
  }

  const fields = useMemo(() => {
    const fromResult = result?.fields || []
    const set = new Set(fromResult)
    for (const f of selectedFields) set.add(f)
    return Array.from(set).sort()
  }, [result?.fields, selectedFields])

  const hits = result?.hits || []
  const hist = result?.histogram || []
  const total = totalHits(result?.total)

  const indexOptions = useMemo(() => {
    const names = indices.map((i) => i.name)
    if (indexPattern && !names.includes(indexPattern)) names.unshift(indexPattern)
    return names.map((n) => ({ value: n, text: n }))
  }, [indices, indexPattern])

  if (bridgeError) {
    return <div className="dscStatus dscStatus--error">{bridgeError}</div>
  }
  if (!connectionId) {
    return <div className="dscStatus">等待连接… 请从连接列表打开 Kibana 工作台。</div>
  }

  return (
    <div className="dscApp">
      <div className="dscChrome">
        <span className="dscChrome__hits">
          {isLoading ? <EuiLoadingSpinner size="s" /> : null}{' '}
          <strong>{total.toLocaleString()}</strong> {total === 1 ? 'hit' : 'hits'}
        </span>
        <button type="button" className="dscChrome__link" onClick={onNew}>
          New
        </button>
        <button type="button" className="dscChrome__link" disabled title="Not available offline">
          Save
        </button>
        <button type="button" className="dscChrome__link" disabled title="Not available offline">
          Open
        </button>
        <button type="button" className="dscChrome__link" disabled title="Not available offline">
          Share
        </button>
        <button type="button" className="dscChrome__link" disabled title="Not available offline">
          Inspect
        </button>
        <div className="dscChrome__spacer" />
        {connectionLabel ? <span className="dscChrome__meta">{connectionLabel}</span> : null}
      </div>

      <div className="dscSearchBlock">
        <div className="dscSearchRow">
          <div className="dscQueryBar">
            <div className="dscQueryBar__filtersLabel">Filters</div>
            <div className="dscQueryBar__inputWrap">
              <EuiFieldText
                fullWidth
                placeholder="Search…"
                value={draftQuery}
                onChange={(e) => setDraftQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitQuery()
                }}
                aria-label="Search query"
              />
            </div>
            <button type="button" className="dscQueryBar__lang" title="Query language">
              Lucene
            </button>
          </div>
          <div className="dscSearchRow__time">
            <EuiSuperDatePicker
              start={start}
              end={end}
              onTimeChange={onTimeChange}
              onRefresh={() => {
                if (draftQuery !== query) setQuery(draftQuery)
                else void runSearch()
              }}
              isPaused={isPaused}
              refreshInterval={refreshInterval}
              onRefreshChange={onRefreshChange}
              commonlyUsedRanges={QUICK_RANGES}
              showUpdateButton={false}
              compressed
            />
            <button
              type="button"
              className="dscRefreshBtn"
              disabled={isLoading}
              onClick={() => {
                if (draftQuery !== query) setQuery(draftQuery)
                else void runSearch()
              }}
            >
              <span className="dscRefreshBtn__icon" aria-hidden>
                ↻
              </span>
              Refresh
            </button>
          </div>
        </div>
        <div className="dscSearchRow__extra">
          <AddFilterPopover fields={fields} onAdd={onAddFilter} />
        </div>
      </div>

      <FilterBar
        filters={filters}
        onRemove={onRemoveFilter}
        onToggleNegate={onToggleNegate}
      />

      {error ? <div className="dscStatus dscStatus--error">{error}</div> : null}

      <div className="dscBody">
        <FieldSidebar
          fields={fields}
          selected={selectedFields}
          hits={hits}
          indexPattern={indexPattern}
          indexOptions={indexOptions}
          onIndexChange={setIndexPattern}
          onAdd={(f) => setSelectedFields((s) => (s.includes(f) ? s : [...s, f]))}
          onRemove={(f) => setSelectedFields((s) => s.filter((x) => x !== f))}
          onAddFilter={onAddFilter}
        />
        <div className="dscMain">
          <Histogram
            buckets={hist}
            timeField={result?.timeField || '@timestamp'}
            fromTime={result?.fromTime}
            toTime={result?.toTime}
          />
          <DocTable
            hits={hits}
            query={effectiveQuery}
            columns={selectedFields}
            timeField={result?.timeField || '@timestamp'}
            onAddFilter={onAddFilter}
            onToggleColumn={(f) =>
              setSelectedFields((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]))
            }
          />
        </div>
      </div>
    </div>
  )
}

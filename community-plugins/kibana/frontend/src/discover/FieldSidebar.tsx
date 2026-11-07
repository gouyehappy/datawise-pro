/**
 * Field chooser — adapted from OSD DiscoverSidebar / DiscoverField
 * (FieldIcon, Top 5 values popover, add/remove).
 */
import { useMemo, useState } from 'react'
import {
  EuiButtonIcon,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiProgress,
  EuiText,
  EuiToolTip,
} from '@elastic/eui'
import { fieldTypeLabel, guessFieldKind } from './fieldTypes'
import { getFieldDetails, rankPopularFields } from '../lib/fieldStats'
import type { SearchHit } from '../lib/types'
import { IndexPatternSelect } from './IndexPatternSelect'

type Props = {
  fields: string[]
  selected: string[]
  hits: SearchHit[]
  indexPattern: string
  indexOptions: Array<{ value: string; text: string }>
  onIndexChange: (value: string) => void
  onAdd: (field: string) => void
  onRemove: (field: string) => void
  onAddFilter: (field: string, value: string, negate: boolean) => void
}

function FieldRow({
  name,
  action,
  hits,
  onAction,
  onAddFilter,
}: {
  name: string
  action: 'add' | 'remove' | null
  hits: SearchHit[]
  onAction?: () => void
  onAddFilter: (field: string, value: string, negate: boolean) => void
}) {
  const kind = guessFieldKind(name)
  const [open, setOpen] = useState(false)
  const details = useMemo(
    () => (open ? getFieldDetails(name, hits) : null),
    [open, name, hits],
  )

  const infoButton = name === '_source' ? null : (
    <EuiPopover
      isOpen={open}
      closePopover={() => setOpen(false)}
      anchorPosition="rightUp"
      panelPaddingSize="s"
      button={
        <EuiButtonIcon
          size="xs"
          iconType="iInCircle"
          color="text"
          aria-label={`View ${name} summary`}
          className="dscFieldItem__info"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((v) => !v)
          }}
        />
      }
      panelClassName="dscFieldPopover"
    >
      <EuiPopoverTitle>Top 5 values</EuiPopoverTitle>
      {!details || details.error ? (
        <EuiText size="xs" color="subdued">
          {details?.error || 'No data'}
        </EuiText>
      ) : details.buckets.length === 0 ? (
        <EuiText size="xs" color="subdued">
          No values in current sample.
        </EuiText>
      ) : (
        <div className="dscFieldBuckets">
          {details.buckets.map((b) => (
            <div key={b.value} className="dscFieldBucket">
              <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="Filter for value">
                    <EuiButtonIcon
                      size="xs"
                      iconType="plusInCircle"
                      color="primary"
                      aria-label={`Filter for ${b.value}`}
                      onClick={() => {
                        onAddFilter(name, b.value, false)
                        setOpen(false)
                      }}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content="Filter out value">
                    <EuiButtonIcon
                      size="xs"
                      iconType="minusInCircle"
                      color="danger"
                      aria-label={`Filter out ${b.value}`}
                      onClick={() => {
                        onAddFilter(name, b.value, true)
                        setOpen(false)
                      }}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiFlexItem className="dscFieldBucket__value" grow>
                  <span title={b.value}>{b.value}</span>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued">
                    {b.percent}%
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiProgress value={b.percent} max={100} size="xs" color="primary" />
            </div>
          ))}
          <EuiText size="xs" color="subdued" className="dscFieldBuckets__footer">
            {details.exists} / {details.total} docs have this field
          </EuiText>
        </div>
      )}
    </EuiPopover>
  )

  return (
    <div className="dscFieldItem" title={name}>
      <span className={`dscFieldItem__type dscFieldItem__type--${kind}`} aria-hidden>
        {fieldTypeLabel(kind)}
      </span>
      <span className="dscFieldItem__name">{name}</span>
      {infoButton}
      {action && onAction ? (
        <EuiButtonIcon
          size="xs"
          iconType={action === 'add' ? 'plusInCircleFilled' : 'cross'}
          color={action === 'add' ? 'primary' : 'danger'}
          aria-label={action === 'add' ? `Add ${name}` : `Remove ${name}`}
          className="dscFieldItem__toggle"
          onClick={onAction}
        />
      ) : null}
    </div>
  )
}

export function FieldSidebar({
  fields,
  selected,
  hits,
  indexPattern,
  indexOptions,
  onIndexChange,
  onAdd,
  onRemove,
  onAddFilter,
}: Props) {
  const [filter, setFilter] = useState('')

  const selectedSet = useMemo(() => new Set(selected), [selected])

  const available = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return fields
      .filter((f) => !selectedSet.has(f))
      .filter((f) => !q || f.toLowerCase().includes(q))
      .slice(0, 500)
  }, [fields, selectedSet, filter])

  const popular = useMemo(
    () => (filter.trim() ? [] : rankPopularFields(available, hits, 9)),
    [available, hits, filter],
  )
  const popularSet = useMemo(() => new Set(popular), [popular])
  const other = useMemo(
    () => available.filter((f) => !popularSet.has(f)),
    [available, popularSet],
  )

  return (
    <aside className="dscSidebar">
      <div className="dscSidebar__index">
        <IndexPatternSelect
          value={indexPattern}
          options={
            indexOptions.length
              ? indexOptions
              : [{ value: indexPattern, text: indexPattern || 'Index pattern' }]
          }
          onChange={onIndexChange}
        />
      </div>

      <div className="dscSidebar__sectionRow">
        <div className="dscSidebar__section">Selected fields</div>
        <EuiToolTip content="Fields shown as columns in the document table">
          <EuiButtonIcon size="xs" iconType="iInCircle" color="text" aria-label="About selected fields" />
        </EuiToolTip>
      </div>
      <div className="dscSidebar__list dscSidebar__list--selected">
        {selected.length === 0 ? (
          <FieldRow name="_source" action={null} hits={hits} onAddFilter={onAddFilter} />
        ) : (
          selected.map((f) => (
            <FieldRow
              key={f}
              name={f}
              action="remove"
              hits={hits}
              onAction={() => onRemove(f)}
              onAddFilter={onAddFilter}
            />
          ))
        )}
      </div>

      <div className="dscSidebar__sectionRow">
        <div className="dscSidebar__section">Available fields</div>
        <EuiToolTip content="Filter and browse fields from the current sample">
          <EuiButtonIcon size="xs" iconType="gear" color="text" aria-label="Field settings" />
        </EuiToolTip>
      </div>
      <div className="dscSidebar__filter">
        <EuiFieldSearch
          compressed
          placeholder="Filter by name"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          isClearable
        />
      </div>
      <div className="dscSidebar__list">
        {popular.length > 0 ? (
          <>
            <div className="dscSidebar__section" style={{ paddingTop: 4 }}>
              Popular
            </div>
            {popular.map((f) => (
              <FieldRow
                key={`p-${f}`}
                name={f}
                action="add"
                hits={hits}
                onAction={() => onAdd(f)}
                onAddFilter={onAddFilter}
              />
            ))}
            <div className="dscSidebar__section" style={{ paddingTop: 8 }}>
              Other fields
            </div>
          </>
        ) : null}
        {(filter.trim() ? available : other).map((f) => (
          <FieldRow
            key={f}
            name={f}
            action="add"
            hits={hits}
            onAction={() => onAdd(f)}
            onAddFilter={onAddFilter}
          />
        ))}
      </div>
    </aside>
  )
}

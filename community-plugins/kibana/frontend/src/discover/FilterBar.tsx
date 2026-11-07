import { EuiBadge, EuiButtonIcon } from '@elastic/eui'
import type { DiscoverFilter } from '../lib/filters'

type Props = {
  filters: DiscoverFilter[]
  onRemove: (id: string) => void
  onToggleNegate: (id: string) => void
}

export function FilterBar({ filters, onRemove, onToggleNegate }: Props) {
  if (!filters.length) return null
  return (
    <div className="dscFilterBar">
      {filters.map((f) => (
        <span
          key={f.id}
          className={`dscFilterPill${f.negate ? ' dscFilterPill--negate' : ''}`}
          title={`${f.negate ? 'NOT ' : ''}${f.field}: ${f.value}`}
        >
          <EuiBadge color={f.negate ? 'danger' : 'primary'}>
            {f.negate ? '≠ ' : ''}
            {f.field}: {f.value.length > 40 ? `${f.value.slice(0, 40)}…` : f.value}
          </EuiBadge>
          <EuiButtonIcon
            size="xs"
            iconType={f.negate ? 'plusInCircle' : 'minusInCircle'}
            color="text"
            aria-label="Toggle include / exclude"
            title="Toggle include / exclude"
            onClick={() => onToggleNegate(f.id)}
          />
          <EuiButtonIcon
            size="xs"
            iconType="cross"
            color="text"
            aria-label="Remove filter"
            onClick={() => onRemove(f.id)}
          />
        </span>
      ))}
    </div>
  )
}

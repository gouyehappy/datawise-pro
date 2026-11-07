/** Kibana-style “Edit filter” popover: Field / Operator / Value. */
import { useState } from 'react'
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFieldText,
  EuiFormRow,
  EuiPopover,
  EuiSelect,
} from '@elastic/eui'

type Props = {
  fields: string[]
  onAdd: (field: string, value: string, negate: boolean) => void
}

export function AddFilterPopover({ fields, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [field, setField] = useState('')
  const [op, setOp] = useState<'is' | 'is_not'>('is')
  const [value, setValue] = useState('')

  const reset = () => {
    setField('')
    setOp('is')
    setValue('')
  }

  const save = () => {
    if (!field.trim() || !value.trim()) return
    onAdd(field.trim(), value.trim(), op === 'is_not')
    reset()
    setOpen(false)
  }

  const fieldOptions = [
    { value: '', text: 'Select a field first' },
    ...fields.map((f) => ({ value: f, text: f })),
  ]

  return (
    <EuiPopover
      isOpen={open}
      closePopover={() => {
        setOpen(false)
        reset()
      }}
      panelPaddingSize="m"
      anchorPosition="downLeft"
      button={
        <div className="dscAddFilterBar">
          <EuiButtonEmpty
            size="xs"
            iconType="plusInCircle"
            onClick={() => setOpen(true)}
            className="dscAddFilterBar__btn"
          >
            Add filter
          </EuiButtonEmpty>
        </div>
      }
    >
      <div className="dscEditFilter">
        <div className="dscEditFilter__header">
          <strong>EDIT FILTER</strong>
        </div>
        <EuiFormRow label="Field" display="rowCompressed" fullWidth>
          <EuiSelect
            compressed
            fullWidth
            options={fieldOptions}
            value={field}
            onChange={(e) => setField(e.target.value)}
          />
        </EuiFormRow>
        <EuiFormRow label="Operator" display="rowCompressed" fullWidth>
          <EuiSelect
            compressed
            fullWidth
            disabled={!field}
            options={[
              { value: 'is', text: 'is' },
              { value: 'is_not', text: 'is not' },
            ]}
            value={op}
            onChange={(e) => setOp(e.target.value as 'is' | 'is_not')}
          />
        </EuiFormRow>
        <EuiFormRow label="Value" display="rowCompressed" fullWidth>
          <EuiFieldText
            compressed
            fullWidth
            disabled={!field}
            placeholder="Enter a value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </EuiFormRow>
        <div className="dscEditFilter__footer">
          <EuiButtonEmpty
            size="s"
            onClick={() => {
              setOpen(false)
              reset()
            }}
          >
            Cancel
          </EuiButtonEmpty>
          <EuiButton size="s" fill disabled={!field.trim() || !value.trim()} onClick={save}>
            Save
          </EuiButton>
        </div>
      </div>
    </EuiPopover>
  )
}

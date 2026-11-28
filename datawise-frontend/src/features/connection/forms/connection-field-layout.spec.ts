import {describe, expect, it} from 'vitest'
import {isConnectionFieldWide} from '@/features/connection/forms/connection-field-layout'
import type {DescriptorFormField} from '@/features/connection/forms/descriptor-connection-bindings'

function field(partial: Partial<DescriptorFormField> & {key: string}): DescriptorFormField {
  return {
    type: 'text',
    binding: 'config',
    ...partial,
  } as DescriptorFormField
}

describe('isConnectionFieldWide', () => {
  it('keeps host and port half-width for pairing', () => {
    expect(isConnectionFieldWide(field({key: 'host', binding: 'host'}))).toBe(false)
    expect(isConnectionFieldWide(field({key: 'port', type: 'number', binding: 'port'}))).toBe(false)
  })

  it('widens selects with many options (e.g. docker protocol)', () => {
    const protocol = field({
      key: 'protocol',
      type: 'select',
      options: [
        {value: 'a'},
        {value: 'b'},
        {value: 'c'},
        {value: 'd'},
        {value: 'e'},
      ],
    })
    expect(isConnectionFieldWide(protocol)).toBe(true)
    expect(
      isConnectionFieldWide(field({
        key: 'auth',
        type: 'select',
        options: [{value: 'a'}, {value: 'b'}],
      })),
    ).toBe(false)
  })

  it('widens path-like keys, textareas, booleans, and file pickers', () => {
    expect(isConnectionFieldWide(field({key: 'socket_path'}))).toBe(true)
    expect(isConnectionFieldWide(field({key: 'pipe_path'}))).toBe(true)
    expect(isConnectionFieldWide(field({key: 'ca_cert_path'}))).toBe(true)
    expect(isConnectionFieldWide(field({key: 'notes', type: 'textarea'}))).toBe(true)
    expect(isConnectionFieldWide(field({key: 'read_only', type: 'boolean'}))).toBe(true)
    expect(isConnectionFieldWide(field({key: 'kubeconfig'}), {hasFilePicker: true})).toBe(true)
  })
})

import { useState, useEffect } from 'react'
import { set, unset }         from 'sanity'
import type { StringInputProps } from 'sanity'
import { useClient }           from 'sanity'
import { Stack, Flex, Spinner, Text } from '@sanity/ui'

interface ContractType { _id: string; name: string }

/**
 * Custom input for ApprovalRule.documentType.
 *
 * Shows a native <select> with two sections:
 *  - Static document types  : Quotation, Any Contract (catch-all), Project Site, Both
 *  - Dynamic contract types : all active ContractType documents fetched live from Sanity
 *
 * Stored value:
 *  - Static types  → 'quotation' | 'contract' | 'projectSite' | 'both'
 *  - Contract type → the ContractType document _id
 */
export function DocumentTypeSelect(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    client
      .fetch<ContractType[]>(
        `*[_type == "contractType" && isActive != false]{ _id, name } | order(name asc)`,
      )
      .then(setContractTypes)
      .catch(() => setContractTypes([]))
      .finally(() => setLoading(false))
  }, [client])

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={1}>
        <Spinner muted />
        <Text size={1} muted>Loading options…</Text>
      </Flex>
    )
  }

  return (
    <Stack space={2}>
      <select
        value={props.value ?? ''}
        onChange={e => {
          const v = e.target.value
          props.onChange(v ? set(v) : unset())
        }}
        style={{
          width:        '100%',
          padding:      '8px 12px',
          border:       '1px solid var(--card-border-color)',
          borderRadius: 4,
          background:   'var(--card-bg-color)',
          color:        'var(--card-fg-color)',
          fontSize:     14,
          cursor:       'pointer',
        }}
      >
        <option value="">— Select —</option>

        <optgroup label="Document Types">
          <option value="quotation">Quotation</option>
          <option value="contract">Any Contract (catch-all)</option>
          <option value="projectSite">Project Site</option>
          <option value="procurement">Procurement</option>
          <option value="termination">Lease Termination (บอกเลิกสัญญาเช่า)</option>
          <option value="withdrawal">Withdrawal of Termination (ถอนการบอกเลิก)</option>
          <option value="addendum">Lease Addendum after signing (บันทึกข้อตกลงแก้ไขเพิ่มเติม)</option>
          <option value="both">Both (Quotation + Any Contract)</option>
        </optgroup>

        {contractTypes.length > 0 && (
          <optgroup label="Contract Types (specific)">
            {contractTypes.map(ct => (
              <option key={ct._id} value={ct._id}>{ct.name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {contractTypes.length === 0 && (
        <Text size={0} muted>
          No Contract Types found. Create one under Contract Types first.
        </Text>
      )}
    </Stack>
  )
}

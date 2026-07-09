'use client'
import React from 'react'

export function Btn({
  onClick, children, variant = 'gold', disabled, size = 'md', type = 'button', className = ''
}: {
  onClick?: () => void
  children: React.ReactNode
  variant?: 'gold' | 'outline' | 'danger' | 'ghost'
  disabled?: boolean
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  className?: string
}) {
  const base = 'inline-flex items-center justify-center rounded-xl font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed'
  const sz = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
  const v = {
    gold: 'bg-[#FFBF00] hover:bg-[#FFD54F] text-black shadow-sm',
    outline: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100',
    ghost: 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sz} ${v} ${className}`}>
      {children}
    </button>
  )
}

export function Badge({ label, variant }: { label: string; variant: 'green' | 'yellow' | 'red' | 'blue' | 'gray' }) {
  const v = {
    green: 'bg-green-100 text-green-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-600',
  }[variant]
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${v}`}>{label}</span>
}

export function Loader() {
  return <div className="text-center py-16 text-gray-400 text-sm">Wird geladen…</div>
}

export function Modal({ title, onClose, children, wide, scroll }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; scroll?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full flex flex-col ${wide ? 'max-w-4xl' : 'max-w-lg'} ${scroll ? 'max-h-[90vh]' : ''}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-base text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className={`px-6 py-5 ${scroll ? 'overflow-y-auto' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

export function Field({
  label, id, value, onChange, type = 'text', error, placeholder, span2, readOnly
}: {
  label: string; id: string; value: string
  onChange?: (v: string) => void
  type?: string; error?: string; placeholder?: string; span2?: boolean; readOnly?: boolean
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <input
        id={id} type={type} value={value} readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-gray-50 border-2 rounded-xl px-3 py-2.5 text-sm text-gray-900
          focus:outline-none focus:bg-white focus:border-[#FFBF00] focus:ring-2 focus:ring-[#FFBF00]/20
          transition-all ${error ? 'border-red-400 bg-red-50' : 'border-gray-200'}
          ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
      />
      {error && <p className="text-xs text-red-600 font-medium mt-1">{error}</p>}
    </div>
  )
}

export function PageHeader({
  title, sub, children
}: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  )
}

export function Card({ title, children, highlight }: {
  title: string; children: React.ReactNode; highlight?: boolean
}) {
  return (
    <div className={`rounded-2xl border p-6 ${highlight ? 'border-[#FFE082] bg-[#FFF9E6]' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-4 bg-[#FFBF00] rounded-full flex-shrink-0" />
        <h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export function Table({ headers, children, empty }: {
  headers: string[]; children: React.ReactNode; empty?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {headers.map(h => (
                <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
        {empty && <div className="text-center py-12 text-gray-400 text-sm">Keine Einträge gefunden.</div>}
      </div>
    </div>
  )
}

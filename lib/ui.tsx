import React from 'react'

type BtnVariant = 'primary' | 'outline' | 'danger' | 'ghost'
type BtnSize = 'sm' | 'md'
type BadgeVariant = 'green' | 'yellow' | 'red' | 'blue' | 'gray'

export function Btn({ onClick, children, variant = 'primary', size = 'md', disabled, className }: {
  onClick?: () => void; children: React.ReactNode; variant?: BtnVariant; size?: BtnSize; disabled?: boolean; className?: string
}) {
  const base = 'inline-flex items-center gap-1.5 font-semibold rounded-xl transition-all border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2' }
  const variants = {
    primary: 'bg-[#FFBF00] border-[#FFBF00] text-black hover:bg-[#FFD54F]',
    outline: 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100',
    ghost: 'bg-transparent border-transparent text-gray-500 hover:bg-gray-50',
  }
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className ?? ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Badge({ label, variant = 'gray' }: { label: string; variant?: BadgeVariant }) {
  const variants = {
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  return (
    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${variants[variant]}`}>
      {label}
    </span>
  )
}

export function Loader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="w-7 h-7 border-2 border-gray-100 border-t-[#FFBF00] rounded-full animate-spin" />
    </div>
  )
}

export function Modal({ title, onClose, children, wide, scroll }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; scroll?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-xl w-full flex flex-col ${wide ? 'max-w-4xl' : 'max-w-lg'} ${scroll ? 'max-h-[90vh]' : ''}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-bold text-base text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">×</button>
        </div>
        <div className={`px-6 py-5 ${scroll ? 'overflow-y-auto' : ''}`}>{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, id, value, onChange, span2, type = 'text' }: {
  label: string; id: string; value: string; onChange: (v: string) => void; span2?: boolean; type?: string
}) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <input
        id={id} type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00] transition-all"
      />
    </div>
  )
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-10">
      <div>
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
      {children && (
        <div className="flex gap-2 items-center flex-wrap justify-end">{children}</div>
      )}
    </div>
  )
}

export function Table({ headers, children, empty }: { headers: string[]; children?: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {headers.map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-gray-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty
            ? <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-sm text-gray-400">Keine Einträge vorhanden</td></tr>
            : children
          }
        </tbody>
      </table>
    </div>
  )
}

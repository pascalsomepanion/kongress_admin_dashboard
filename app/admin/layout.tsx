'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/db'
const NAV=[{href:'/admin',label:'Dashboard',icon:'📊'},{href:'/admin/teilnehmer',label:'Teilnehmer',icon:'👥'},{href:'/admin/buchungen',label:'Zahlungen',icon:'💶'},{href:'/admin/rechnungen',label:'Rechnungen',icon:'🧾'},{href:'/admin/sponsoren',label:'Sponsoren',icon:'🏢'},{href:'/admin/kurse',label:'Kurse',icon:'📚'},{href:'/admin/kongress',label:'Kongress',icon:'🏆'},{href:'/admin/export',label:'Export',icon:'📥'},
        {href:'/admin/anwesenheit',label:'Anwesenheit',icon:'✓'}]
export default function AdminLayout({children}:{children:React.ReactNode}){
  const router=useRouter(),pathname=usePathname()
  const [ok,setOk]=useState(false),[email,setEmail]=useState('')
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(!data.session){router.push('/login');return};setEmail(data.session.user.email??'');setOk(true)})},[router])
  if(!ok)return <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center"><p className="text-gray-400 text-sm">Wird geladen…</p></div>
  return(
    <div className="min-h-screen bg-[#F7F6F3] flex">
      <aside className="w-52 bg-[#111] flex flex-col flex-shrink-0 fixed h-full z-20">
        <div className="px-4 py-5 border-b border-white/10"><div className="w-8 h-8 bg-[#FFBF00] rounded-lg flex items-center justify-center text-xs font-black text-black mb-3">SM</div><p className="text-[10px] font-bold tracking-widest uppercase text-white/40">Admin</p><p className="text-sm font-bold text-white leading-tight">Kongress Sportmedizin</p></div>
        <nav className="flex-1 py-3 overflow-y-auto">{NAV.map(n=>{const a=pathname===n.href||(n.href!=='/admin'&&pathname.startsWith(n.href));return(<Link key={n.href} href={n.href} className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all ${a?'bg-[#FFBF00] text-black':'text-white/60 hover:text-white hover:bg-white/5'}`}><span className="text-base">{n.icon}</span>{n.label}</Link>)})}</nav>
        <div className="px-4 py-4 border-t border-white/10"><p className="text-[10px] text-white/40 truncate mb-2">{email}</p><button onClick={async()=>{await supabase.auth.signOut();router.push('/login')}} className="w-full text-xs text-white/50 hover:text-white py-1.5 rounded-lg hover:bg-white/5 transition-all text-left px-2">Abmelden →</button></div>
      </aside>
      <main className="flex-1 ml-52 min-h-screen">{children}</main>
    </div>
  )
}

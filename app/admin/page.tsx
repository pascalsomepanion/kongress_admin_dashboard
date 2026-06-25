'use client'
import { useEffect, useState } from 'react'
import { supabase, getAktuellerKongress, type Kongress } from '@/lib/db'

export default function Dashboard() {
  const [k,setK]=useState<Kongress|null>(null)
  const [stats,setStats]=useState({tn:0,b:0,bezahlt:0,offen:0,storno:0,sp:0,spOffen:0})
  const [belegung,setBelegung]=useState<{titel:string;count:number}[]>([])
  const [loading,setLoading]=useState(true)
  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return};setK(k)
    const[{data:b},{data:sp},{data:sr}]=await Promise.all([
      supabase.from('buchungen').select('id,teilnehmer_id,gebuchter_preis,zahlungsstatus,kurse(titel)').eq('kongress_id',k.id),
      supabase.from('sponsoren').select('id').eq('kongress_id',k.id),
      supabase.from('sponsoren_rechnungen').select('zahlungsstatus').eq('kongress_id',k.id),
    ])
    const bArr=(b??[]) as any[]
    const bezahlt=bArr.filter(x=>x.zahlungsstatus==='bezahlt').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0)
    const offen=bArr.filter(x=>x.zahlungsstatus==='ausstehend').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0)
    const km:Record<string,number>={}
    bArr.forEach((x:any)=>{const t=x.kurse?.titel??'?';km[t]=(km[t]??0)+1})
    setBelegung(Object.entries(km).map(([titel,count])=>({titel,count})).sort((a,b)=>b.count-a.count))
    setStats({tn:new Set(bArr.map((x:any)=>x.teilnehmer_id)).size,b:bArr.length,bezahlt,offen,storno:bArr.filter((x:any)=>x.zahlungsstatus==='storniert').length,sp:sp?.length??0,spOffen:(sr??[]).filter((x:any)=>x.zahlungsstatus==='ausstehend').length})
    setLoading(false)
  })},[])
  const max=Math.max(...belegung.map(b=>b.count),1)
  return(
    <div>
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
        {k&&<span className="bg-[#FFF9E6] border border-[#FFE082] rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-700">{k.name} {k.jahr}</span>}
      </div>
      <div className="p-6">
        {loading?<div className="text-center py-16 text-gray-400">Wird geladen…</div>:<>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[['Teilnehmer',stats.tn,''],['Buchungen',stats.b,''],['Bezahlt',`€ ${stats.bezahlt.toLocaleString('de-AT',{minimumFractionDigits:2})}`,'text-green-700'],['Ausstehend',`€ ${stats.offen.toLocaleString('de-AT',{minimumFractionDigits:2})}`,'text-amber-700'],['Stornierungen',stats.storno,'text-red-600'],['Sponsoren',stats.sp,''],['Sponsoren offen',stats.spOffen,'text-amber-700'],['Gesamtumsatz',`€ ${(stats.bezahlt+stats.offen).toLocaleString('de-AT',{minimumFractionDigits:2})}`,'']].map(([l,v,c])=>(
              <div key={l as string} className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">{l}</p>
                <p className={`text-xl font-extrabold ${c}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Kursbelegung</h2>
            <div className="space-y-2.5">
              {belegung.map(b=>(
                <div key={b.titel} className="flex items-center gap-3">
                  <div className="text-xs text-gray-700 w-56 truncate">{b.titel}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2"><div className="bg-[#FFBF00] h-2 rounded-full" style={{width:`${(b.count/max)*100}%`}}/></div>
                  <div className="text-xs font-bold text-gray-700 w-5 text-right">{b.count}</div>
                </div>
              ))}
              {belegung.length===0&&<p className="text-sm text-gray-400">Noch keine Buchungen</p>}
            </div>
          </div>
        </>}
      </div>
    </div>
  )
}
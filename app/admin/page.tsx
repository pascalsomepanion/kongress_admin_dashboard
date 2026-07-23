'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Loader,PageHeader}from'@/lib/ui'

type KPI={label:string;value:string;sub:string;color:string}
type KursBelegung={titel:string;count:number;max:number}
type Laender={land:string;count:number}
type LetzteTn={id:number;vorname:string;nachname:string;land:string;registriert_am:string;kurse_count:number;betrag:number}

export default function DashboardPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[loading,setLoading]=useState(true)
  const[kpis,setKpis]=useState<KPI[]>([])
  const[belegung,setBelegung]=useState<KursBelegung[]>([])
  const[laender,setLaender]=useState<Laender[]>([])
  const[letzte,setLetzte]=useState<LetzteTn[]>([])
  const[offeneZahlungen,setOffeneZahlungen]=useState(0)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[{data:tn},{data:buch},{data:kurse}]=await Promise.all([
      supabase.from('teilnehmer').select('id,vorname,nachname,land,registriert_am').eq('kongress_id',k.id).order('registriert_am',{ascending:false}),
      supabase.from('buchungen').select('id,teilnehmer_id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel)').eq('kongress_id',k.id),
      supabase.from('kurse').select('id,titel,max_teilnehmer').eq('kongress_id',k.id).eq('ist_pflichtprogramm',false),
    ])
    const teilnehmer=tn??[]
    const buchungen=buch??[]
    const allKurse=kurse??[]

    // KPIs
    const bezahlt=buchungen.filter((b:any)=>b.zahlungsstatus==='bezahlt')
    const ausstehend=buchungen.filter((b:any)=>b.zahlungsstatus==='ausstehend')
    const umsatz=bezahlt.reduce((s:number,b:any)=>s+b.gebuchter_preis,0)
    const offen=ausstehend.reduce((s:number,b:any)=>s+b.gebuchter_preis,0)
    setOffeneZahlungen(offen)
    setKpis([
      {label:'Angemeldete Teilnehmer',value:String(teilnehmer.length),sub:`${k.jahr}`,color:'#ffc803'},
      {label:'Bezahlte Buchungen',value:String(bezahlt.length),sub:`von ${buchungen.filter((b:any)=>b.zahlungsstatus!=='storniert').length} gesamt`,color:'#22c55e'},
      {label:'Offene Zahlungen',value:`€ ${offen.toFixed(0)}`,sub:`${ausstehend.length} Buchungen offen`,color:'#f59e0b'},
      {label:'Gesamtumsatz',value:`€ ${umsatz.toFixed(0)}`,sub:'bezahlte Buchungen',color:'#60a5fa'},
    ])

    // Kursbelegung
    const belegMap:Record<string,number>={}
    buchungen.filter((b:any)=>b.zahlungsstatus!=='storniert'&&b.gebuchter_preis>0).forEach((b:any)=>{
      const titel=(b.kurse as any)?.titel??'Unbekannt'
      belegMap[titel]=(belegMap[titel]??0)+1
    })
    const belegArr=Object.entries(belegMap).map(([titel,count])=>({
      titel,count,max:allKurse.find((k:any)=>k.titel===titel)?.max_teilnehmer??999
    })).sort((a,b)=>b.count-a.count)
    setBelegung(belegArr)

    // Länder
    const landMap:Record<string,number>={}
    teilnehmer.forEach((t:any)=>{landMap[t.land]=(landMap[t.land]??0)+1})
    const landArr=Object.entries(landMap).map(([land,count])=>({land,count})).sort((a,b)=>b.count-a.count).slice(0,8)
    setLaender(landArr)

    // Letzte Anmeldungen
    const letzteIds=teilnehmer.slice(0,8).map((t:any)=>t.id)
    const letzteData=teilnehmer.slice(0,8).map((t:any)=>{
      const tb=buchungen.filter((b:any)=>b.teilnehmer_id===t.id&&b.zahlungsstatus!=='storniert')
      return{
        id:t.id,vorname:t.vorname,nachname:t.nachname,land:t.land,
        registriert_am:t.registriert_am,
        kurse_count:tb.length,
        betrag:tb.reduce((s:number,b:any)=>s+b.gebuchter_preis,0)
      }
    })
    setLetzte(letzteData)
    setLoading(false)
  })},[])

  if(loading)return<div className="p-6"><Loader/></div>
  if(!k)return<div className="p-6 text-gray-400 text-sm">Kein aktiver Kongress.</div>

  const maxBelegung=Math.max(...belegung.map(b=>b.count),1)
  const maxLand=Math.max(...laender.map(l=>l.count),1)

  return(
    <div>
      <PageHeader title="Dashboard" sub={`${k.name} ${k.jahr}`}/>
      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map(kpi=>(
            <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">{kpi.label}</p>
              <p className="text-3xl font-extrabold text-gray-900 mb-1" style={{color:kpi.color}}>{kpi.value}</p>
              <p className="text-xs text-gray-400">{kpi.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Kursbelegung */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800">Kursbelegung</h2>
              <p className="text-xs text-gray-400 mt-0.5">aktive Buchungen pro Kurs</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {belegung.length===0&&<p className="text-sm text-gray-400">Keine Buchungen</p>}
              {belegung.map(b=>(
                <div key={b.titel}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-700">{b.titel}</span>
                    <span className="text-xs font-bold text-gray-900">{b.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{width:`${(b.count/maxBelegung)*100}%`,background:'#FFBF00'}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Länderverteilung */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-800">Länderverteilung</h2>
              <p className="text-xs text-gray-400 mt-0.5">Herkunft der Teilnehmer</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              {laender.length===0&&<p className="text-sm text-gray-400">Keine Daten</p>}
              {laender.map(l=>(
                <div key={l.land}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-gray-700">{l.land}</span>
                    <span className="text-xs font-bold text-gray-900">{l.count}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{width:`${(l.count/maxLand)*100}%`,background:'#111'}}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Letzte Anmeldungen */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-800">Letzte Anmeldungen</h2>
            <p className="text-xs text-gray-400 mt-0.5">die 8 neuesten Teilnehmer</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Name','Land','Kurse','Betrag','Angemeldet'].map(h=>(
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {letzte.map((t,i)=>(
                <tr key={t.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-all ${i===letzte.length-1?'border-0':''}`}>
                  <td className="px-5 py-3 font-semibold text-sm text-gray-900">{t.nachname} {t.vorname}</td>
                  <td className="px-5 py-3 text-sm text-gray-500">{t.land}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{t.kurse_count} Kurs{t.kurse_count!==1?'e':''}</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">€ {t.betrag.toFixed(2)}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{new Date(t.registriert_am).toLocaleDateString('de-AT')}</td>
                </tr>
              ))}
              {letzte.length===0&&<tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">Noch keine Anmeldungen</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Offene Zahlungen Banner */}
        {offeneZahlungen>0&&(
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-amber-800">Offene Zahlungen</p>
              <p className="text-xs text-amber-600 mt-0.5">Buchungen mit Status "ausstehend"</p>
            </div>
            <p className="text-2xl font-extrabold text-amber-700">€ {offeneZahlungen.toFixed(2)}</p>
          </div>
        )}

      </div>
    </div>
  )
}

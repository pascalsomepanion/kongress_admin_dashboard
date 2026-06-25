'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import Link from 'next/link'

type Stats={
  tnGesamt:number;tnHeute:number;tnDieseWoche:number;
  bezahlt:number;ausstehend:number;storniert:number;stornoAnzahl:number;
  rechnungenErstellt:number;rechnungenVersendet:number;
  sponsoren:number;sponsorenOffen:number;sponsorenBezahlt:number;
  buchungenGesamt:number;
}
type KursBelegung={titel:string;count:number;uhrzeit:string|null;gruppe:string}
type LetzteAnmeldung={id:number;vorname:string;nachname:string;email:string;registriert_am:string;land:string;betrag:number}
type OffeneZahlung={teilnehmer_id:number;vorname:string;nachname:string;email:string;betrag:number;seit:string}
type LandStats={land:string;count:number}

export default function Dashboard(){
  const[k,setK]=useState<Kongress|null>(null)
  const[stats,setStats]=useState<Stats|null>(null)
  const[belegung,setBelegung]=useState<KursBelegung[]>([])
  const[letzteAnmeldungen,setLetzteAnmeldungen]=useState<LetzteAnmeldung[]>([])
  const[offeneZahlungen,setOffeneZahlungen]=useState<OffeneZahlung[]>([])
  const[laender,setLaender]=useState<LandStats[]>([])
  const[loading,setLoading]=useState(true)

  useEffect(()=>{
    getAktuellerKongress().then(async k=>{
      if(!k){setLoading(false);return}
      setK(k)

      const[{data:buchungen},{data:sponsoren},{data:sponsRech},{data:rechnungen},{data:teilnehmer}]=await Promise.all([
        supabase.from('buchungen').select('id,teilnehmer_id,gebuchter_preis,zahlungsstatus,gebucht_am,rechnungsnummer,rechnung_versendet_am,kurse(titel,uhrzeit,kurs_gruppe),teilnehmer(vorname,nachname,email,registriert_am,land)').eq('kongress_id',k.id),
        supabase.from('sponsoren').select('id').eq('kongress_id',k.id),
        supabase.from('sponsoren_rechnungen').select('zahlungsstatus,betrag_brutto').eq('kongress_id',k.id),
        supabase.from('rechnungen').select('id,versendet_am').eq('kongress_id',k.id),
        supabase.from('teilnehmer').select('id,vorname,nachname,email,registriert_am,land').eq('kongress_id',k.id).order('registriert_am',{ascending:false}),
      ])

      const b=(buchungen??[]) as any[]
      const heute=new Date(); heute.setHours(0,0,0,0)
      const wocheAgo=new Date(); wocheAgo.setDate(wocheAgo.getDate()-7)

      // Stats
      const tnIds=new Set(b.map((x:any)=>x.teilnehmer_id))
      const bezahlt=b.filter((x:any)=>x.zahlungsstatus==='bezahlt').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0)
      const ausstehend=b.filter((x:any)=>x.zahlungsstatus==='ausstehend').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0)
      const tnHeute=(teilnehmer??[]).filter((t:any)=>new Date(t.registriert_am)>=heute).length
      const tnWoche=(teilnehmer??[]).filter((t:any)=>new Date(t.registriert_am)>=wocheAgo).length

      setStats({
        tnGesamt:tnIds.size, tnHeute, tnDieseWoche:tnWoche,
        bezahlt, ausstehend,
        storniert:b.filter((x:any)=>x.zahlungsstatus==='storniert').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0),
        stornoAnzahl:b.filter((x:any)=>x.zahlungsstatus==='storniert').length,
        rechnungenErstellt:(rechnungen??[]).length,
        rechnungenVersendet:(rechnungen??[]).filter((r:any)=>r.versendet_am).length,
        sponsoren:sponsoren?.length??0,
        sponsorenOffen:(sponsRech??[]).filter((r:any)=>r.zahlungsstatus==='ausstehend').length,
        sponsorenBezahlt:(sponsRech??[]).filter((r:any)=>r.zahlungsstatus==='bezahlt').reduce((s:number,r:any)=>s+Number(r.betrag_brutto??0),0),
        buchungenGesamt:b.filter((x:any)=>x.zahlungsstatus!=='storniert').length,
      })

      // Kursbelegung
      const km:Record<string,{count:number;uhrzeit:string|null;gruppe:string}>={}
      b.filter((x:any)=>x.zahlungsstatus!=='storniert').forEach((x:any)=>{
        const t=x.kurse?.titel??'?'
        if(!km[t])km[t]={count:0,uhrzeit:x.kurse?.uhrzeit??null,gruppe:x.kurse?.kurs_gruppe??''}
        km[t].count++
      })
      setBelegung(Object.entries(km).map(([titel,d])=>({titel,count:d.count,uhrzeit:d.uhrzeit,gruppe:d.gruppe})).sort((a,b)=>b.count-a.count))

      // Letzte Anmeldungen
      const letzteIds=new Set<number>()
      const letzte:LetzteAnmeldung[]=[]
      for(const t of (teilnehmer??[]).slice(0,8)){
        if(letzteIds.has(t.id))continue
        letzteIds.add(t.id)
        const betrag=b.filter((x:any)=>x.teilnehmer_id===t.id&&x.zahlungsstatus!=='storniert').reduce((s:number,x:any)=>s+Number(x.gebuchter_preis),0)
        letzte.push({id:t.id,vorname:t.vorname,nachname:t.nachname,email:t.email,registriert_am:t.registriert_am,land:t.land,betrag})
      }
      setLetzteAnmeldungen(letzte)

      // Offene Zahlungen
      const offenMap:Record<number,{vorname:string;nachname:string;email:string;betrag:number;seit:string}>={}
      b.filter((x:any)=>x.zahlungsstatus==='ausstehend').forEach((x:any)=>{
        const tid=x.teilnehmer_id
        if(!offenMap[tid])offenMap[tid]={vorname:x.teilnehmer?.vorname,nachname:x.teilnehmer?.nachname,email:x.teilnehmer?.email,betrag:0,seit:x.gebucht_am}
        offenMap[tid].betrag+=Number(x.gebuchter_preis)
      })
      setOffeneZahlungen(Object.entries(offenMap).map(([id,d])=>({teilnehmer_id:Number(id),...d})).sort((a,b)=>b.betrag-a.betrag).slice(0,8))

      // Länderverteilung
      const lm:Record<string,number>={}
      ;(teilnehmer??[]).forEach((t:any)=>{lm[t.land]=(lm[t.land]??0)+1})
      setLaender(Object.entries(lm).map(([land,count])=>({land,count})).sort((a,b)=>b.count-a.count).slice(0,6))

      setLoading(false)
    })
  },[])

  if(loading)return(
    <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center">
      <p className="text-gray-400 text-sm">Dashboard wird geladen…</p>
    </div>
  )

  const maxBelegung=Math.max(...belegung.map(b=>b.count),1)
  const euro=(n:number)=>`€ ${n.toLocaleString('de-AT',{minimumFractionDigits:2,maximumFractionDigits:2})}`

  return(
    <div className="min-h-screen bg-[#F7F6F3]">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">{k?.name} {k?.jahr} · {k?.ort}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{new Date().toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</span>
          {k&&<span className="bg-[#FFF9E6] border border-[#FFE082] rounded-xl px-3 py-1.5 text-xs font-semibold text-amber-700">{new Date(k.datum_von).toLocaleDateString('de-AT')} – {new Date(k.datum_bis).toLocaleDateString('de-AT')}</span>}
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* KPI GRID */}
        <div className="grid grid-cols-4 gap-4">
          <KPI icon="👥" label="Teilnehmer gesamt" value={stats?.tnGesamt??0} sub={`+${stats?.tnHeute??0} heute · +${stats?.tnDieseWoche??0} diese Woche`} color="text-gray-900"/>
          <KPI icon="💶" label="Bezahlt" value={euro(stats?.bezahlt??0)} sub={`von ${euro((stats?.bezahlt??0)+(stats?.ausstehend??0))} Gesamtumsatz`} color="text-green-700"/>
          <KPI icon="⏳" label="Ausstehend" value={euro(stats?.ausstehend??0)} sub={`${offeneZahlungen.length} offene Zahlungen`} color="text-amber-700" alert/>
          <KPI icon="📚" label="Buchungen" value={stats?.buchungenGesamt??0} sub={`${stats?.stornoAnzahl??0} Stornierungen`} color="text-gray-900"/>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <KPI icon="🧾" label="Rechnungen erstellt" value={stats?.rechnungenErstellt??0} sub={`${stats?.rechnungenVersendet??0} versendet`} color="text-gray-900"/>
          <KPI icon="🏢" label="Sponsoren" value={stats?.sponsoren??0} sub={`${stats?.sponsorenOffen??0} Rechnungen offen`} color="text-gray-900"/>
          <KPI icon="💰" label="Sponsor-Einnahmen" value={euro(stats?.sponsorenBezahlt??0)} sub="bezahlte Sponsoren-Rechnungen" color="text-green-700"/>
          <KPI icon="❌" label="Stornowert" value={euro(stats?.storniert??0)} sub={`${stats?.stornoAnzahl??0} Buchungen storniert`} color="text-red-600"/>
        </div>

        <div className="grid grid-cols-3 gap-6">

          {/* KURSBELEGUNG */}
          <div className="col-span-2 bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Kursbelegung</h2></div>
              <span className="text-xs text-gray-400">{belegung.reduce((s,b)=>s+b.count,0)} Buchungen total</span>
            </div>
            <div className="space-y-3">
              {belegung.map(b=>(
                <div key={b.titel} className="flex items-center gap-3">
                  <div className="w-48 flex-shrink-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{b.titel}</p>
                    {b.uhrzeit&&<p className="text-[10px] text-gray-400">{b.uhrzeit}</p>}
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 relative">
                    <div className={`h-3 rounded-full transition-all ${b.gruppe==='block'?'bg-[#FFBF00]':b.gruppe==='ps'?'bg-blue-400':'bg-purple-400'}`} style={{width:`${(b.count/maxBelegung)*100}%`}}/>
                  </div>
                  <div className="w-12 text-right">
                    <span className="text-sm font-bold text-gray-700">{b.count}</span>
                    <span className="text-[10px] text-gray-400 ml-1">{Math.round((b.count/Math.max(belegung[0]?.count,1))*100)}%</span>
                  </div>
                </div>
              ))}
              {belegung.length===0&&<p className="text-sm text-gray-400 text-center py-4">Noch keine Buchungen</p>}
            </div>
            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
              {[['bg-[#FFBF00]','Blockkurse'],['bg-blue-400','Praxisseminare'],['bg-purple-400','Theorieseminare']].map(([c,l])=>(
                <div key={l} className="flex items-center gap-1.5"><div className={`w-3 h-3 rounded-full ${c}`}/><span className="text-[10px] text-gray-500">{l}</span></div>
              ))}
            </div>
          </div>

          {/* LÄNDERVERTEILUNG */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Herkunft</h2></div>
            <div className="space-y-3">
              {laender.map((l,i)=>{
                const maxL=laender[0]?.count??1
                const colors=['bg-[#FFBF00]','bg-amber-400','bg-orange-300','bg-yellow-300','bg-lime-300','bg-green-300']
                return(
                  <div key={l.land} className="flex items-center gap-2">
                    <div className="text-xs text-gray-700 w-24 truncate font-medium">{l.land}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${colors[i]??'bg-gray-300'}`} style={{width:`${(l.count/maxL)*100}%`}}/></div>
                    <div className="text-xs font-bold text-gray-700 w-5 text-right">{l.count}</div>
                  </div>
                )
              })}
              {laender.length===0&&<p className="text-sm text-gray-400">Noch keine Daten</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">

          {/* LETZTE ANMELDUNGEN */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Letzte Anmeldungen</h2></div>
              <Link href="/admin/teilnehmer" className="text-xs text-amber-700 font-semibold hover:underline">Alle →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {letzteAnmeldungen.map(t=>(
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <div className="w-8 h-8 bg-[#FFF9E6] border border-[#FFE082] rounded-full flex items-center justify-center text-xs font-bold text-amber-700 flex-shrink-0">
                    {t.nachname.charAt(0)}{t.vorname.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.nachname} {t.vorname}</p>
                    <p className="text-[10px] text-gray-400">{t.land} · {new Date(t.registriert_am).toLocaleDateString('de-AT',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p>
                  </div>
                  <span className="text-sm font-bold text-gray-700 flex-shrink-0">{euro(t.betrag)}</span>
                </div>
              ))}
              {letzteAnmeldungen.length===0&&<p className="text-sm text-gray-400 text-center py-8">Noch keine Anmeldungen</p>}
            </div>
          </div>

          {/* OFFENE ZAHLUNGEN */}
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2"><div className="w-1 h-4 bg-amber-400 rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Offene Zahlungen</h2></div>
              <Link href="/admin/buchungen" className="text-xs text-amber-700 font-semibold hover:underline">Alle →</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {offeneZahlungen.map(t=>(
                <div key={t.teilnehmer_id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <div className="w-8 h-8 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-xs font-bold text-amber-600 flex-shrink-0">
                    {t.nachname.charAt(0)}{t.vorname.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.nachname} {t.vorname}</p>
                    <p className="text-[10px] text-gray-400">seit {new Date(t.seit).toLocaleDateString('de-AT')}</p>
                  </div>
                  <span className="text-sm font-bold text-amber-700 flex-shrink-0">{euro(t.betrag)}</span>
                </div>
              ))}
              {offeneZahlungen.length===0&&(
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">✓</p>
                  <p className="text-sm text-green-600 font-semibold">Alle Zahlungen eingegangen!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SCHNELLZUGRIFF */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Schnellzugriff</h2></div>
          <div className="grid grid-cols-6 gap-3">
            {[
              {href:'/admin/teilnehmer',icon:'👥',label:'Teilnehmer'},
              {href:'/admin/buchungen',icon:'💶',label:'Buchungen'},
              {href:'/admin/rechnungen',icon:'🧾',label:'Rechnungen'},
              {href:'/admin/sponsoren',icon:'🏢',label:'Sponsoren'},
              {href:'/admin/export',icon:'📥',label:'Export'},
              {href:'/admin/kongress',icon:'🏆',label:'Kongress'},
            ].map(item=>(
              <Link key={item.href} href={item.href} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-[#FFBF00] hover:bg-[#FFF9E6] transition-all group">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-xs font-semibold text-gray-600 group-hover:text-amber-700">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

function KPI({icon,label,value,sub,color,alert}:{icon:string;label:string;value:string|number;sub?:string;color:string;alert?:boolean}){
  return(
    <div className={`bg-white border rounded-2xl px-5 py-4 ${alert?'border-amber-200':'border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      </div>
      <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
      {sub&&<p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

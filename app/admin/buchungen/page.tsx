'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Btn,Badge,Loader,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;zahlungs_eingang_am:string|null;storniert_am:string|null;rechnungsnummer:string|null;gebucht_am:string;kurse:{titel:string;uhrzeit:string|null}}
type TeilnehmerGruppe={tnId:number;vorname:string;nachname:string;email:string;oeak_nr:string;buchungen:Buchung[]}

export default function BuchungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[gruppen,setGruppen]=useState<TeilnehmerGruppe[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[sf,setSf]=useState('alle')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[saving,setSaving]=useState<string|null>(null)

  useEffect(()=>{
    getAktuellerKongress().then(async k=>{
      if(!k){setLoading(false);return}
      setK(k)
      await loadData(k.id)
      setLoading(false)
    })
  },[])

  async function loadData(kongressId:number){
    const{data}=await supabase.from('buchungen')
      .select('id,kurs_id,gebuchter_preis,zahlungsstatus,zahlungs_eingang_am,storniert_am,rechnungsnummer,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,oeak_nr),kurse(titel,uhrzeit)')
      .eq('kongress_id',kongressId)
      .order('gebucht_am',{ascending:false})
    
    // Gruppieren nach Teilnehmer
    const map:Record<number,TeilnehmerGruppe>={}
    ;(data??[]).forEach((b:any)=>{
      const tid=b.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,vorname:b.teilnehmer.vorname,nachname:b.teilnehmer.nachname,email:b.teilnehmer.email,oeak_nr:b.teilnehmer.oeak_nr,buchungen:[]}
      map[tid].buchungen.push({id:b.id,kurs_id:b.kurs_id,gebuchter_preis:b.gebuchter_preis,zahlungsstatus:b.zahlungsstatus,zahlungs_eingang_am:b.zahlungs_eingang_am,storniert_am:b.storniert_am,rechnungsnummer:b.rechnungsnummer,gebucht_am:b.gebucht_am,kurse:b.kurse})
    })
    setGruppen(Object.values(map).sort((a,b)=>a.nachname.localeCompare(b.nachname)))
  }

  // Gruppen nach Rechnungsnummer innerhalb eines Teilnehmers
  function getRechnungsgruppen(buchungen:Buchung[]):{rNr:string|null;buchungen:Buchung[];allBezahlt:boolean;hasOffen:boolean}[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{
      const key=b.rechnungsnummer??'__ohne_rechnung__'
      if(!map[key])map[key]=[]
      map[key].push(b)
    })
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne_rechnung__'?null:key,
      buchungen:bs,
      allBezahlt:bs.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert'),
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
    }))
  }

  async function setBezahlt(buchungen:Buchung[]){
    const ids=buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>b.id)
    if(!ids.length)return
    const key=buchungen[0].rechnungsnummer??`offen_${buchungen[0].id}`
    setSaving(key)
    for(const id of ids){
      await supabase.from('buchungen').update({zahlungsstatus:'bezahlt',zahlungs_eingang_am:new Date().toISOString()}).eq('id',id)
    }
    if(k)await loadData(k.id)
    setSaving(null)
  }

  async function setZurueck(buchungen:Buchung[]){
    const key=buchungen[0].rechnungsnummer??`offen_${buchungen[0].id}`
    setSaving(key)
    for(const b of buchungen){
      if(b.zahlungsstatus==='bezahlt'){
        await supabase.from('buchungen').update({zahlungsstatus:'ausstehend',zahlungs_eingang_am:null}).eq('id',b.id)
      }
    }
    if(k)await loadData(k.id)
    setSaving(null)
  }

  async function stornieren(buchungId:number){
    if(!confirm('Buchung stornieren?'))return
    await supabase.from('buchungen').update({zahlungsstatus:'storniert',storniert_am:new Date().toISOString()}).eq('id',buchungId)
    if(k)await loadData(k.id)
  }

  async function updatePreis(buchungId:number, preis:number){
    await supabase.from('buchungen').update({gebuchter_preis:preis}).eq('id',buchungId)
    if(k)await loadData(k.id)
  }

  const filtered=gruppen.filter(g=>{
    const s=q.toLowerCase()
    const matchQ=!q||`${g.vorname} ${g.nachname} ${g.email} ${g.oeak_nr}`.toLowerCase().includes(s)
    if(!matchQ)return false
    if(sf==='alle')return true
    if(sf==='ausstehend')return g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
    if(sf==='bezahlt')return g.buchungen.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert')
    if(sf==='storniert')return g.buchungen.some(b=>b.zahlungsstatus==='storniert')
    return true
  })

  const totalBezahlt=gruppen.flatMap(g=>g.buchungen).filter(b=>b.zahlungsstatus==='bezahlt').reduce((s,b)=>s+b.gebuchter_preis,0)
  const totalOffen=gruppen.flatMap(g=>g.buchungen).filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)

  const ST:Record<string,{label:string;v:'green'|'yellow'|'red'}>={bezahlt:{label:'Bezahlt',v:'green'},ausstehend:{label:'Ausstehend',v:'yellow'},storniert:{label:'Storniert',v:'red'}}

  return(
    <div>
      <PageHeader title="Buchungen" sub={`${filtered.length} Teilnehmer · Bezahlt: €${totalBezahlt.toFixed(2)} · Offen: €${totalOffen.toFixed(2)}`}>
        <input placeholder="Name, E-Mail, ÖÄK-Nr." value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-52 focus:outline-none focus:border-[#FFBF00]"/>
        <div className="flex gap-1">
          {['alle','ausstehend','bezahlt','storniert'].map(s=>(
            <button key={s} onClick={()=>setSf(s)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${sf===s?'bg-[#FFBF00] text-black':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filtered.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Keine Einträge</div>}
            {filtered.map((g,i)=>{
              const isOpen=expanded===g.tnId
              const rGruppen=getRechnungsgruppen(g.buchungen)
              const gesamtOffen=g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)
              const gesamtBezahlt=g.buchungen.filter(b=>b.zahlungsstatus==='bezahlt').reduce((s,b)=>s+b.gebuchter_preis,0)
              const hatOffene=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              const allesBezahlt=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')

              return(
                <div key={g.tnId} className={i>0?'border-t border-gray-100':''}>
                  {/* HAUPTZEILE */}
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>
                      {isOpen?'−':'+'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{g.nachname} {g.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.email}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {allesBezahlt&&<Badge label="Alles bezahlt" variant="green"/>}
                      {hatOffene&&<span className="text-sm font-bold text-amber-700">€ {gesamtOffen.toFixed(2)} offen</span>}
                      {gesamtBezahlt>0&&<span className="text-sm font-bold text-green-700">€ {gesamtBezahlt.toFixed(2)} bezahlt</span>}
                      <span className="text-xs text-gray-400">{g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').length} Kurse</span>
                    </div>
                  </div>

                  {/* AUFGEKLAPPT */}
                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 pb-5 pt-4">
                      {rGruppen.map((rg,ri)=>(
                        <div key={ri} className="mb-4 last:mb-0">
                          {/* Rechnungsgruppen-Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {rg.rNr
                                ? <span className="text-xs font-bold text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded-lg">📄 {rg.rNr}</span>
                                : <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">⚡ Nachbuchung — keine Rechnung</span>
                              }
                              <span className="text-xs text-gray-400">{rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').length} Kurs{rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').length!==1?'e':''}</span>
                              <span className="text-xs font-bold text-gray-700">
                                € {rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}
                              </span>
                            </div>
                            {/* PRO GRUPPE EIN KLICK */}
                            <div className="flex gap-2">
                              {rg.hasOffen&&(
                                <Btn size="sm" onClick={()=>setBezahlt(rg.buchungen)} disabled={saving===( rg.rNr??`offen_${rg.buchungen[0].id}`)}>
                                  {saving===(rg.rNr??`offen_${rg.buchungen[0].id}`)?'Speichert…':`✓ Zahlung erhalten${rg.rNr?' — '+rg.rNr:''}`}
                                </Btn>
                              )}
                              {rg.allBezahlt&&rg.buchungen.some(b=>b.zahlungsstatus==='bezahlt')&&(
                                <Btn size="sm" variant="outline" onClick={()=>setZurueck(rg.buchungen)}>Zurücksetzen</Btn>
                              )}
                            </div>
                          </div>

                          {/* Einzelne Buchungen */}
                          <div className="space-y-1.5 pl-2">
                            {rg.buchungen.map(b=>(
                              <div key={b.id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${b.zahlungsstatus==='storniert'?'border-red-200 bg-red-50':b.zahlungsstatus==='bezahlt'?'border-green-200 bg-green-50':'border-gray-200 bg-white'}`}>
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-semibold text-gray-800">{b.kurse.titel}</span>
                                  {b.kurse.uhrzeit&&<span className="text-xs text-gray-400 ml-2">{b.kurse.uhrzeit}</span>}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <input type="number" defaultValue={b.gebuchter_preis} onBlur={e=>{const v=parseFloat(e.target.value);if(v!==b.gebuchter_preis)updatePreis(b.id,v)}}
                                    className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:border-[#FFBF00]"/>
                                  <Badge label={ST[b.zahlungsstatus]?.label??b.zahlungsstatus} variant={ST[b.zahlungsstatus]?.v??'gray'}/>
                                  {b.zahlungs_eingang_am&&<span className="text-[10px] text-gray-400">{new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT')}</span>}
                                  {b.zahlungsstatus!=='storniert'&&(
                                    <button onClick={()=>stornieren(b.id)} className="text-[10px] text-red-400 hover:text-red-700 font-semibold">Storno</button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

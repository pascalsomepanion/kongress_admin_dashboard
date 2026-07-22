'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;zahlungs_eingang_am:string|null;rechnungsnummer:string|null;gebucht_am:string;kurse:{titel:string;uhrzeit:string|null}}
type TeilnehmerGruppe={tnId:number;vorname:string;nachname:string;email:string;buchungen:Buchung[]}

export default function ZahlungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[gruppen,setGruppen]=useState<TeilnehmerGruppe[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[sf,setSf]=useState('ausstehend')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[saving,setSaving]=useState<string|null>(null)
  const[zahlungModal,setZahlungModal]=useState<{buchungen:Buchung[];bar:boolean}|null>(null)
  const[zahlungDatum,setZahlungDatum]=useState('')
  const[frühbucherWarnung,setFrühbucherWarnung]=useState<{differenz:number;bis:string}|null>(null)

  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);await loadData(k.id);setLoading(false)})},[])

  async function loadData(kid:number){
    const{data}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,zahlungs_eingang_am,rechnungsnummer,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email),kurse(titel,uhrzeit)').eq('kongress_id',kid).gt('gebuchter_preis',0).order('gebucht_am',{ascending:false})
    const map:Record<number,TeilnehmerGruppe>={}
    ;(data??[]).forEach((b:any)=>{
      const tid=b.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,vorname:b.teilnehmer.vorname,nachname:b.teilnehmer.nachname,email:b.teilnehmer.email,buchungen:[]}
      map[tid].buchungen.push({id:b.id,kurs_id:b.kurs_id,gebuchter_preis:b.gebuchter_preis,zahlungsstatus:b.zahlungsstatus,zahlungs_eingang_am:b.zahlungs_eingang_am,rechnungsnummer:b.rechnungsnummer,gebucht_am:b.gebucht_am,kurse:b.kurse})
    })
    setGruppen(Object.values(map).sort((a,b)=>a.nachname.localeCompare(b.nachname)))
  }

  function getRechnungsgruppen(buchungen:Buchung[]):{rNr:string|null;buchungen:Buchung[];allBezahlt:boolean;hasOffen:boolean}[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{
      const key=b.rechnungsnummer??'__ohne__'
      if(!map[key])map[key]=[]
      map[key].push(b)
    })
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne__'?null:key,
      buchungen:bs,
      allBezahlt:bs.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert'),
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
    }))
  }

  function openZahlungModal(buchungen:Buchung[],bar:boolean){
    const heute=new Date().toISOString().split('T')[0]
    setZahlungDatum(heute)
    setFrühbucherWarnung(null)
    setZahlungModal({buchungen,bar})
  }

  function checkFrühbucher(datum:string){
    setZahlungDatum(datum)
    if(!k||!datum)return
    const zahlDat=new Date(datum)
    const fruehBis=new Date(k.fruehbucher_bis)
    if(zahlDat>fruehBis&&zahlungModal){
      // Check if any booking used Frühbucherpreis
      const offene=zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
      // We can't know exact Frühbucherpreis here without kurse data
      // Just warn that Frühbucherfrist was exceeded
      setFrühbucherWarnung({
        differenz:0,
        bis:fruehBis.toLocaleDateString('de-AT')
      })
    } else {
      setFrühbucherWarnung(null)
    }
  }

  async function bestaetigeZahlung(){
    if(!zahlungModal||!k)return
    const{buchungen,bar}=zahlungModal
    const ids=buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>b.id)
    if(!ids.length)return
    const key=buchungen[0].rechnungsnummer??`k_${buchungen[0].id}`
    setSaving(key)
    const zahlDat=new Date(zahlungDatum).toISOString()
    for(const id of ids){
      await supabase.from('buchungen').update({zahlungsstatus:'bezahlt',zahlungs_eingang_am:zahlDat}).eq('id',id)
    }
    if(k)await loadData(k.id)
    setSaving(null)
    setZahlungModal(null)
    setFrühbucherWarnung(null)
  }

  async function zuruecksetzen(buchungen:Buchung[]){
    const key=buchungen[0].rechnungsnummer??`k_${buchungen[0].id}`
    setSaving(key)
    for(const b of buchungen){
      if(b.zahlungsstatus==='bezahlt'){
        await supabase.from('buchungen').update({zahlungsstatus:'ausstehend',zahlungs_eingang_am:null}).eq('id',b.id)
      }
    }
    if(k)await loadData(k.id)
    setSaving(null)
  }

  const filtered=gruppen.filter(g=>{
    const s=q.toLowerCase()
    const matchQ=!q||`${g.vorname} ${g.nachname} ${g.email}`.toLowerCase().includes(s)
    if(!matchQ)return false
    const aktiv=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    if(sf==='ausstehend')return aktiv.some(b=>b.zahlungsstatus==='ausstehend')
    if(sf==='bezahlt')return aktiv.length>0&&aktiv.every(b=>b.zahlungsstatus==='bezahlt')
    return true
  })

  const totalBezahlt=gruppen.flatMap(g=>g.buchungen).filter(b=>b.zahlungsstatus==='bezahlt').reduce((s,b)=>s+b.gebuchter_preis,0)
  const totalOffen=gruppen.flatMap(g=>g.buchungen).filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)
  const anzahlOffen=new Set(gruppen.filter(g=>g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')).map(g=>g.tnId)).size

  return(
    <div>
      <PageHeader title="Zahlungen" sub={`${anzahlOffen} Teilnehmer mit offenen Zahlungen · Bezahlt: €${totalBezahlt.toFixed(2)} · Offen: €${totalOffen.toFixed(2)}`}>
        <input placeholder="Name oder E-Mail…" value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-52 focus:outline-none focus:border-[#FFBF00]"/>
        <div className="flex gap-1">
          {[['alle','Alle'],['ausstehend','Offen'],['bezahlt','Bezahlt']].map(([v,l])=>(
            <button key={v} onClick={()=>setSf(v)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${sf===v?'bg-[#FFBF00] text-black':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
      </PageHeader>

      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filtered.length===0&&<div className="text-center py-12 text-gray-400 text-sm">{sf==='ausstehend'?'Keine offenen Zahlungen — alles bezahlt! ✓':'Keine Einträge'}</div>}
            {filtered.map((g,i)=>{
              const isOpen=expanded===g.tnId
              const rGruppen=getRechnungsgruppen(g.buchungen)
              const gesamtOffen=g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)
              const gesamtBezahlt=g.buchungen.filter(b=>b.zahlungsstatus==='bezahlt').reduce((s,b)=>s+b.gebuchter_preis,0)
              const hatOffene=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              const allesBezahlt=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')
              return(
                <div key={g.tnId} className={i>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{g.nachname} {g.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.email}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {allesBezahlt&&<Badge label="✓ Alles bezahlt" variant="green"/>}
                      {hatOffene&&<span className="text-sm font-bold text-amber-700">€ {gesamtOffen.toFixed(2)} offen</span>}
                      {gesamtBezahlt>0&&!allesBezahlt&&<span className="text-sm font-semibold text-green-700">€ {gesamtBezahlt.toFixed(2)} bezahlt</span>}
                    </div>
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-8 pb-5 pt-4 space-y-4">
                      {rGruppen.map((rg,ri)=>(
                        <div key={ri}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {rg.rNr
                                ?<span className="text-xs font-bold text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded-lg">📄 {rg.rNr}</span>
                                :<span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">⚡ Ohne Rechnung</span>
                              }
                              <span className="text-xs font-bold text-gray-700">
                                € {rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}
                              </span>
                              {rg.allBezahlt&&<Badge label="Bezahlt" variant="green"/>}
                              {rg.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                            </div>
                            <div className="flex gap-2">
                              {rg.hasOffen&&(
                                <>
                                  <Btn size="sm" onClick={()=>openZahlungModal(rg.buchungen,false)} disabled={!!saving}>
                                    ✓ Überweisung erhalten
                                  </Btn>
                                  <Btn size="sm" variant="outline" onClick={()=>openZahlungModal(rg.buchungen,true)} disabled={!!saving}>
                                    💵 Bar bezahlt
                                  </Btn>
                                </>
                              )}
                              {rg.allBezahlt&&rg.buchungen.some(b=>b.zahlungsstatus==='bezahlt')&&(
                                <Btn size="sm" variant="outline" onClick={()=>zuruecksetzen(rg.buchungen)}>Zurücksetzen</Btn>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1 pl-2">
                            {rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>(
                              <div key={b.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${b.zahlungsstatus==='bezahlt'?'border-green-200 bg-green-50':'border-gray-200 bg-white'}`}>
                                <div>
                                  <span className="font-medium text-gray-800">{b.kurse.titel}</span>
                                  {b.kurse.uhrzeit&&<span className="text-xs text-gray-400 ml-2">{b.kurse.uhrzeit}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-700">€ {b.gebuchter_preis.toFixed(2)}</span>
                                  {b.zahlungs_eingang_am&&<span className="text-[10px] text-gray-400">{new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT')}</span>}
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

      {/* ZAHLUNG MODAL */}
      {zahlungModal&&(
        <Modal title={zahlungModal.bar?'Barzahlung bestätigen':'Zahlung bestätigen'} onClose={()=>{setZahlungModal(null);setFrühbucherWarnung(null)}}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-4">
              {zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>(
                <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-200 last:border-0">
                  <span>{b.kurse.titel}</span>
                  <span className="font-bold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 mt-1">
                <span>Gesamt</span>
                <span>€ {zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">Zahlungseingang (Datum)</label>
              <input type="date" value={zahlungDatum} onChange={e=>checkFrühbucher(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/>
            </div>

            {frühbucherWarnung&&(
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-800">⚠ Frühbucherfrist überschritten</p>
                <p className="text-xs text-amber-700 mt-1">Die Frühbucherfrist war am {frühbucherWarnung.bis} abgelaufen. Prüfe ob der gebuchte Preis dem Normaltarif entspricht. Falls nicht, stelle eine Nachforderung.</p>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Btn variant="outline" onClick={()=>{setZahlungModal(null);setFrühbucherWarnung(null)}}>Abbrechen</Btn>
              <Btn onClick={bestaetigeZahlung} disabled={!!saving||!zahlungDatum}>
                {saving?'Speichert…':zahlungModal.bar?'💵 Barzahlung bestätigen':'✓ Zahlung bestätigen'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

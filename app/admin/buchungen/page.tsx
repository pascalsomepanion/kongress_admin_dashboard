'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Btn,Badge,Loader,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;zahlungs_eingang_am:string|null;rechnungsnummer:string|null;gebucht_am:string;kurse:{titel:string;uhrzeit:string|null;fruehbucher_preis:number;spaetbucher_preis:number;mitglied_spaetbucher_preis:number|null}}
type TeilnehmerGruppe={tnId:number;vorname:string;nachname:string;email:string;ist_oegsmp_mitglied:boolean;buchungen:Buchung[]}

export default function ZahlungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[gruppen,setGruppen]=useState<TeilnehmerGruppe[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[sf,setSf]=useState('ausstehend')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[saving,setSaving]=useState<string|null>(null)
  const[zahlModal,setZahlModal]=useState<{buchungen:Buchung[];tn:{vorname:string;nachname:string;ist_oegsmp_mitglied:boolean};key:string}|null>(null)
  const[zahlDatum,setZahlDatum]=useState('')
  const[erinnerungSending,setErinnerungSending]=useState<number|null>(null)
  const[zahlBar,setZahlBar]=useState(false)
  const[preisItems,setPreisItems]=useState<{id:number;titel:string;gebuchterPreis:number;normalPreis:number;useNormal:boolean}[]>([])

  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);await loadData(k.id);setLoading(false)})},[])

  async function loadData(kid:number){
    const{data}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,zahlungs_eingang_am,rechnungsnummer,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,ist_oegsmp_mitglied),kurse(titel,uhrzeit,fruehbucher_preis,spaetbucher_preis,mitglied_spaetbucher_preis)').eq('kongress_id',kid).order('gebucht_am',{ascending:false})
    const map:Record<number,TeilnehmerGruppe>={}
    ;(data??[]).forEach((b:any)=>{
      const tid=b.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,vorname:b.teilnehmer.vorname,nachname:b.teilnehmer.nachname,email:b.teilnehmer.email,ist_oegsmp_mitglied:b.teilnehmer.ist_oegsmp_mitglied??false,buchungen:[]}
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

  function openZahlModal(buchungen:Buchung[],tn:{vorname:string;nachname:string;ist_oegsmp_mitglied:boolean},key:string){
    setZahlDatum(new Date().toISOString().split('T')[0])
    setZahlBar(false)
    setPreisItems([])
    setZahlModal({buchungen,tn,key})
  }

  function onDatumChange(datum:string){
    setZahlDatum(datum)
    if(!k||!zahlModal)return
    const zahlD=new Date(datum)
    const fruehD=new Date(k.fruehbucher_bis)
    if(zahlD>fruehD){
      const items=zahlModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>{
        const normal=zahlModal.tn.ist_oegsmp_mitglied&&b.kurse.mitglied_spaetbucher_preis?b.kurse.mitglied_spaetbucher_preis:b.kurse.spaetbucher_preis
        return{id:b.id,titel:b.kurse.titel,gebuchterPreis:b.gebuchter_preis,normalPreis:normal,useNormal:b.gebuchter_preis<normal}
      }).filter(i=>i.gebuchterPreis<i.normalPreis)
      setPreisItems(items)
    } else {
      setPreisItems([])
    }
  }

  async function bestaetigeZahlung(){
    if(!zahlModal||!k)return
    setSaving(zahlModal.key)
    const offene=zahlModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
    const zahlD=new Date(zahlDatum).toISOString()
    for(const b of offene){
      const item=preisItems.find(i=>i.id===b.id)
      const neuerPreis=item?.useNormal?item.normalPreis:b.gebuchter_preis
      await supabase.from('buchungen').update({zahlungsstatus:'bezahlt',zahlungs_eingang_am:zahlD,gebuchter_preis:neuerPreis}).eq('id',b.id)
    }
    setZahlModal(null);setPreisItems([])
    if(k)await loadData(k.id)
    setSaving(null)
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

  async function sendZahlungserinnerung(g:TeilnehmerGruppe){
    if(!k)return
    setErinnerungSending(g.tnId)
    const offene=g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
    const betrag=offene.reduce((s,b)=>s+b.gebuchter_preis,0)
    await fetch('/api/send-zahlungserinnerung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      email:g.email,vorname:g.vorname,nachname:g.nachname,
      betrag,kurse:offene.map(b=>b.kurse.titel),
      kongress_name:k.name,kongress_jahr:k.jahr,
      iban:k.iban,bic:k.bic,kontoinhaber:k.kontoinhaber,
      kontakt_email:k.kontakt_email,
    })})
    setErinnerungSending(null)
  }

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
                      {gesamtOffen>0&&<Btn size="sm" variant="outline" disabled={erinnerungSending===g.tnId} onClick={()=>sendZahlungserinnerung(g)}>
                        {erinnerungSending===g.tnId?'Sendet…':'📧 Zahlungserinnerung'}
                      </Btn>}
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
                                :<span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">⚡ Nachbuchung</span>
                              }
                              <span className="text-xs font-bold text-gray-700">
                                € {rg.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}
                              </span>
                              {rg.allBezahlt&&<Badge label="Bezahlt" variant="green"/>}
                              {rg.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                            </div>
                            <div className="flex gap-2">
                              {rg.hasOffen&&(
                                <Btn size="sm" onClick={()=>openZahlModal(rg.buchungen,{vorname:g.vorname,nachname:g.nachname,ist_oegsmp_mitglied:g.ist_oegsmp_mitglied},rg.rNr??`k_${rg.buchungen[0].id}`)} disabled={saving===(rg.rNr??`k_${rg.buchungen[0].id}`)}>
                                  {saving===(rg.rNr??`k_${rg.buchungen[0].id}`)?'Speichert…':`✓ Zahlung erhalten${rg.rNr?' — '+rg.rNr:''}`}
                                </Btn>
                              )}
                              {rg.allBezahlt&&rg.buchungen.some(b=>b.zahlungsstatus==='bezahlt')&&!rg.rNr&&(
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
      {zahlModal&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-base">{zahlBar?'💵 Barzahlung':'✓ Überweisung'} — {zahlModal.tn.nachname} {zahlModal.tn.vorname}</h2>
              <button onClick={()=>setZahlModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                {zahlModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>(
                  <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                    <span>{b.kurse.titel}</span><span className="font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t">
                  <span>Gesamt</span>
                  <span>€ {zahlModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Zahlungseingang (Datum)</label>
                <input type="date" value={zahlDatum} onChange={e=>onDatumChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/>
                {k&&<p className="text-xs text-gray-400 mt-1">Frühbucherfrist: {new Date(k.fruehbucher_bis).toLocaleDateString('de-AT')}</p>}
              </div>
              {preisItems.length>0&&(
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-bold text-amber-800 mb-2">⚠ Frühbucherfrist überschritten</p>
                  <p className="text-xs text-amber-700 mb-3">Folgende Kurse wurden zum Frühbucherpreis gebucht. Normaltarif anwenden?</p>
                  {preisItems.map((item,idx)=>(
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                      <div>
                        <p className="text-sm font-semibold">{item.titel}</p>
                        <p className="text-xs text-amber-600">Frühbucher € {item.gebuchterPreis} → Normal € {item.normalPreis}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer ml-3">
                        <input type="checkbox" checked={item.useNormal} onChange={e=>{
                          const next=[...preisItems]
                          next[idx]={...next[idx],useNormal:e.target.checked}
                          setPreisItems(next)
                        }} className="accent-amber-500"/>
                        Normal
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <Btn variant="outline" onClick={()=>setZahlModal(null)}>Abbrechen</Btn>
                <Btn onClick={bestaetigeZahlung} disabled={!!saving||!zahlDatum}>
                  {saving?'Speichert…':zahlBar?'💵 Barzahlung bestätigen':'✓ Zahlung bestätigen'}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,type Kongress,type Kurs}from'@/lib/db'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;zahlungs_eingang_am:string|null;rechnungsnummer:string|null;gebucht_am:string;teilnehmer_id:number;kurse:{titel:string;fruehbucher_preis:number;spaetbucher_preis:number;mitglied_fruehbucher_preis:number|null;mitglied_spaetbucher_preis:number|null}}
type TN={id:number;vorname:string;nachname:string;email:string;ist_oegsmp_mitglied:boolean}
type Gruppe={tn:TN;buchungen:Buchung[]}
type PriceItem={buchungId:number;titel:string;gebuchterPreis:number;fruehbucher:number;normal:number;useNormal:boolean}

export default function BuchungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[gruppen,setGruppen]=useState<Gruppe[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[saving,setSaving]=useState<string|null>(null)
  // Zahlung Modal
  const[zahlungModal,setZahlungModal]=useState<{buchungen:Buchung[];tn:TN;bar:boolean}|null>(null)
  const[zahlungDatum,setZahlungDatum]=useState('')
  const[preisAnpassung,setPreisAnpassung]=useState<PriceItem[]>([])
  const[showPreisWarnung,setShowPreisWarnung]=useState(false)

  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);await loadData(k.id);setLoading(false)})},[])

  async function loadData(kid:number){
    const{data}=await supabase.from('buchungen')
      .select('id,kurs_id,gebuchter_preis,zahlungsstatus,zahlungs_eingang_am,rechnungsnummer,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,ist_oegsmp_mitglied),kurse(titel,fruehbucher_preis,spaetbucher_preis,mitglied_fruehbucher_preis,mitglied_spaetbucher_preis)')
      .eq('kongress_id',kid).gt('gebuchter_preis',0).order('gebucht_am',{ascending:false})
    const map:Record<number,Gruppe>={}
    ;(data??[]).forEach((x:any)=>{
      const tid=x.teilnehmer_id
      if(!map[tid])map[tid]={tn:x.teilnehmer,buchungen:[]}
      map[tid].buchungen.push({...x,kurse:x.kurse})
    })
    setGruppen(Object.values(map).sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname)))
  }

  function openZahlungModal(buchungen:Buchung[],tn:TN,bar:boolean){
    const heute=new Date().toISOString().split('T')[0]
    setZahlungDatum(heute)
    setShowPreisWarnung(false)
    setPreisAnpassung([])
    setZahlungModal({buchungen,tn,bar})
  }

  function onDatumChange(datum:string){
    setZahlungDatum(datum)
    if(!k||!zahlungModal||!datum)return
    const zahlDat=new Date(datum)
    const fruehBis=new Date(k.fruehbucher_bis)
    const offene=zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
    if(zahlDat>fruehBis){
      // Check which bookings used Frühbucherpreis
      const items:PriceItem[]=offene.map(b=>{
        const istMitglied=zahlungModal.tn.ist_oegsmp_mitglied
        const frueh=b.kurse.fruehbucher_preis
        const normal=istMitglied&&b.kurse.mitglied_spaetbucher_preis?b.kurse.mitglied_spaetbucher_preis:b.kurse.spaetbucher_preis
        const hatFruehbucher=b.gebuchter_preis<normal
        return{buchungId:b.id,titel:b.kurse.titel,gebuchterPreis:b.gebuchter_preis,fruehbucher:b.gebuchter_preis,normal,useNormal:hatFruehbucher}
      }).filter(i=>i.useNormal) // only show those where price differs
      setPreisAnpassung(items)
      setShowPreisWarnung(items.length>0)
    } else {
      setPreisAnpassung([])
      setShowPreisWarnung(false)
    }
  }

  async function bestaetigeZahlung(){
    if(!zahlungModal||!k)return
    const{buchungen,bar}=zahlungModal
    const offene=buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
    if(!offene.length)return
    const key=`${zahlungModal.tn.id}`
    setSaving(key)
    const zahlDat=new Date(zahlungDatum).toISOString()
    for(const b of offene){
      const anpassung=preisAnpassung.find(p=>p.buchungId===b.id)
      const neuerPreis=anpassung?.useNormal?anpassung.normal:b.gebuchter_preis
      await supabase.from('buchungen').update({
        zahlungsstatus:'bezahlt',
        zahlungs_eingang_am:zahlDat,
        gebuchter_preis:neuerPreis,
      }).eq('id',b.id)
    }
    if(k)await loadData(k.id)
    setSaving(null);setZahlungModal(null);setPreisAnpassung([]);setShowPreisWarnung(false)
  }

  async function zuruecksetzen(buchungen:Buchung[],tnId:number){
    setSaving(`r_${tnId}`)
    for(const b of buchungen.filter(b=>b.zahlungsstatus==='bezahlt')){
      await supabase.from('buchungen').update({zahlungsstatus:'ausstehend',zahlungs_eingang_am:null}).eq('id',b.id)
    }
    if(k)await loadData(k.id)
    setSaving(null)
  }

  // Group by Rechnungsnummer within a Teilnehmer
  function getRechnungsGruppen(buchungen:Buchung[]):{rNr:string|null;buchungen:Buchung[];hasOffen:boolean;allBezahlt:boolean}[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{const key=b.rechnungsnummer??'__ohne__';if(!map[key])map[key]=[];map[key].push(b)})
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne__'?null:key,
      buchungen:bs,
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
      allBezahlt:bs.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert'),
    }))
  }

  const fruehBisText=k?new Date(k.fruehbucher_bis).toLocaleDateString('de-AT'):''
  const filtered=gruppen.filter(g=>!q||`${g.tn.vorname} ${g.tn.nachname} ${g.tn.email}`.toLowerCase().includes(q.toLowerCase()))

  return(
    <div>
      <PageHeader title="Zahlungen" sub={`${filtered.length} Teilnehmer`}>
        <input placeholder="Name oder E-Mail suchen" value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-64 focus:outline-none focus:border-[#FFBF00]"/>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filtered.length===0&&<div className="text-center py-12 text-sm text-gray-400">Keine Buchungen</div>}
            {filtered.map((g,gi)=>{
              const rGruppen=getRechnungsGruppen(g.buchungen)
              const hatAusstehend=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              const gesamtOffen=g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)
              return(
                <div key={g.tn.id} className={gi>0?'border-t border-gray-100':''}>
                  {/* Teilnehmer Header */}
                  <div className="flex items-center gap-4 px-4 py-3 bg-gray-50">
                    <div className="flex-1">
                      <span className="font-semibold text-sm">{g.tn.nachname} {g.tn.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.tn.email}</span>
                    </div>
                    {hatAusstehend&&(
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-amber-700">€ {gesamtOffen.toFixed(2)} offen</span>
                        <Btn size="sm" disabled={!!saving} onClick={()=>openZahlungModal(g.buchungen,g.tn,false)}>✓ Überweisung</Btn>
                        <Btn size="sm" variant="outline" disabled={!!saving} onClick={()=>openZahlungModal(g.buchungen,g.tn,true)}>💵 Bar</Btn>
                      </div>
                    )}
                  </div>
                  {/* Rechnungsgruppen */}
                  {rGruppen.map((rg,ri)=>(
                    <div key={ri} className="border-t border-gray-100">
                      <div className="flex items-center gap-3 px-4 py-2.5 bg-white">
                        <span className={`text-xs font-bold ${rg.rNr?'text-gray-600 font-mono':'text-amber-600'}`}>
                          {rg.rNr??'Ohne Rechnung'}
                        </span>
                        {rg.allBezahlt&&!rg.hasOffen&&<Badge label="Bezahlt" variant="green"/>}
                        {rg.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                        <span className="text-xs text-gray-400 ml-auto">
                          € {rg.buchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}
                        </span>
                        {rg.allBezahlt&&!rg.hasOffen&&(
                          <Btn size="sm" variant="ghost" onClick={()=>zuruecksetzen(rg.buchungen,g.tn.id)}>
                            {saving===`r_${g.tn.id}`?'…':'↩ Zurücksetzen'}
                          </Btn>
                        )}
                      </div>
                      {rg.buchungen.map(b=>(
                        <div key={b.id} className="flex items-center justify-between px-6 py-2 border-t border-gray-50">
                          <div className="flex items-center gap-3">
                            <span className={`text-sm ${b.zahlungsstatus==='storniert'?'line-through text-gray-400':''}`}>{b.kurse.titel}</span>
                            <Badge label={b.zahlungsstatus==='bezahlt'?'Bezahlt':b.zahlungsstatus==='storniert'?'Storniert':'Ausstehend'} variant={b.zahlungsstatus==='bezahlt'?'green':b.zahlungsstatus==='storniert'?'red':'yellow'}/>
                            {b.zahlungs_eingang_am&&<span className="text-[10px] text-gray-400">{new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT')}</span>}
                          </div>
                          <span className="text-sm font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ZAHLUNG BESTÄTIGEN MODAL */}
      {zahlungModal&&(
        <Modal title={`${zahlungModal.bar?'Barzahlung':'Überweisung'} bestätigen — ${zahlungModal.tn.nachname} ${zahlungModal.tn.vorname}`} onClose={()=>setZahlungModal(null)} scroll>
          <div className="space-y-4">
            {/* Offene Buchungen */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Offene Buchungen</p>
              {zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').map(b=>(
                <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-200 last:border-0">
                  <span>{b.kurse.titel}</span>
                  <span className="font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t">
                <span>Gesamt</span>
                <span>€ {zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>

            {/* Datum */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2">Zahlungseingang (Datum)</label>
              <input type="date" value={zahlungDatum} onChange={e=>onDatumChange(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/>
              <p className="text-xs text-gray-400 mt-1">Frühbucherfrist: {fruehBisText}</p>
            </div>

            {/* Frühbucher Warnung + Preisanpassung */}
            {showPreisWarnung&&preisAnpassung.length>0&&(
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm font-bold text-amber-800 mb-1">⚠ Frühbucherfrist überschritten</p>
                <p className="text-xs text-amber-700 mb-3">Das Zahlungsdatum liegt nach der Frühbucherfrist ({fruehBisText}). Bei folgenden Kursen wurde der Frühbucherpreis verrechnet. Bitte entscheide ob du den Normaltarif anwenden möchtest:</p>
                {preisAnpassung.map((item,idx)=>(
                  <div key={item.buchungId} className="flex items-center justify-between py-2 border-b border-amber-100 last:border-0">
                    <div>
                      <p className="text-sm font-semibold">{item.titel}</p>
                      <p className="text-xs text-amber-600">Frühbucher: € {item.fruehbucher} → Normal: € {item.normal}</p>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={item.useNormal} onChange={e=>{
                        const next=[...preisAnpassung]
                        next[idx]={...next[idx],useNormal:e.target.checked}
                        setPreisAnpassung(next)
                      }} className="accent-amber-500"/>
                      Normaltarif anwenden
                    </label>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm pt-2 mt-1 border-t border-amber-200">
                  <span>Neuer Gesamtbetrag</span>
                  <span>€ {(zahlungModal.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>{
                    const anp=preisAnpassung.find(p=>p.buchungId===b.id)
                    return s+(anp?.useNormal?anp.normal:b.gebuchter_preis)
                  },0)).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Btn variant="outline" onClick={()=>setZahlungModal(null)}>Abbrechen</Btn>
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

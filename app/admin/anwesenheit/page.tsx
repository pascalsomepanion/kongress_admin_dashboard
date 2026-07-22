'use client'
import{useEffect,useState,useRef}from'react'
import{supabase,getAktuellerKongress,getKurse,type Kongress,type Kurs}from'@/lib/db'
import{Btn,Loader,PageHeader}from'@/lib/ui'

type Teilnehmer={id:number;vorname:string;nachname:string;oeak_nr:string;email:string}
type Buchung={id:number;kurs_id:number;zahlungsstatus:string;einheiten_besucht:number|null;dfp_erhalten:number|null;kurse:{titel:string;untertitel:string|null;dfp_punkte_gesamt:number|null;einheiten_gesamt:number;kurs_gruppe:string;uhrzeit:string|null;wochentag_datum:string;oeak_kategorie:string|null}}

export default function AnwesenheitPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[teilnehmer,setTeilnehmer]=useState<Teilnehmer[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[buchungen,setBuchungen]=useState<Record<number,Buchung[]>>({})
  const[saving,setSaving]=useState<number|null>(null)
  const[savedMsg,setSavedMsg]=useState<number|null>(null)
  const[preview,setPreview]=useState<string|null>(null)
  const[previewName,setPreviewName]=useState('')
  const[sending,setSending]=useState<number|null>(null)

  const pflichtkurse=kurse.filter(k=>k.ist_pflichtprogramm)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[{data:tn},allKurse]=await Promise.all([
      supabase.from('teilnehmer').select('id,vorname,nachname,oeak_nr,email').eq('kongress_id',k.id).order('nachname'),
      getKurse(k.id)
    ])
    setTeilnehmer((tn as Teilnehmer[])??[])
    setKurse(allKurse)
    setLoading(false)
  })},[])

  async function toggleExpand(t:Teilnehmer){
    if(expanded===t.id){setExpanded(null);return}
    setExpanded(t.id)
    if(!buchungen[t.id]){
      // Load existing bookings
      const{data}=await supabase.from('buchungen')
        .select('id,kurs_id,zahlungsstatus,einheiten_besucht,dfp_erhalten,kurse(titel,untertitel,dfp_punkte_gesamt,einheiten_gesamt,kurs_gruppe,uhrzeit,wochentag_datum,oeak_kategorie)')
        .eq('teilnehmer_id',t.id).neq('zahlungsstatus','storniert')
      const existing=(data as unknown as Buchung[])??[]

      // For Pflichtkurse: create booking with €0 if not exists
      const existingKursIds=existing.map(b=>b.kurs_id)
      const missingPflicht=pflichtkurse.filter(pk=>!existingKursIds.includes(pk.id))
      for(const pk of missingPflicht){
        const{data:newB}=await supabase.from('buchungen').insert({
          teilnehmer_id:t.id,kurs_id:pk.id,gebuchter_preis:0,
          zahlungsstatus:'bezahlt',kongress_id:k!.id,
          gebucht_am:new Date().toISOString()
        }).select('id,kurs_id,zahlungsstatus,einheiten_besucht,dfp_erhalten,kurse(titel,untertitel,dfp_punkte_gesamt,einheiten_gesamt,kurs_gruppe,uhrzeit,wochentag_datum,oeak_kategorie)').single()
        if(newB)existing.push(newB as unknown as Buchung)
      }
      setBuchungen(prev=>({...prev,[t.id]:existing}))
    }
  }

  function updateEinheiten(tnId:number,buchungId:number,val:number,kurs:Buchung['kurse']){
    const dfpProEinheit=kurs.dfp_punkte_gesamt&&kurs.einheiten_gesamt?(kurs.dfp_punkte_gesamt/kurs.einheiten_gesamt):0
    const dfp=Math.round(dfpProEinheit*val*10)/10
    setBuchungen(prev=>({...prev,[tnId]:prev[tnId].map(b=>b.id===buchungId?{...b,einheiten_besucht:val,dfp_erhalten:dfp}:b)}))
  }

  async function saveAnwesenheit(tnId:number){
    setSaving(tnId)
    for(const b of buchungen[tnId]??[]){
      await supabase.from('buchungen').update({einheiten_besucht:b.einheiten_besucht,dfp_erhalten:b.dfp_erhalten}).eq('id',b.id)
    }
    setSaving(null)
    setSavedMsg(tnId)
    setTimeout(()=>setSavedMsg(null),2000)
  }

  function calcDfpTotal(tnId:number):number{
    return Math.round((buchungen[tnId]??[]).reduce((s,b)=>s+(b.dfp_erhalten??0),0)*10)/10
  }

  function buildBestaetigung(t:Teilnehmer,tnId:number):string{
    if(!k)return''
    const bs=(buchungen[tnId]??[]).filter(b=>(b.einheiten_besucht??0)>0)
    const total=calcDfpTotal(tnId)
    const totalStunden=bs.reduce((s,b)=>s+(b.einheiten_besucht??0),0)
    const datum=`${new Date(k.datum_von).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})} – ${new Date(k.datum_bis).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}`
    const ort=k.ort??'St. Christoph am Arlberg'
    const dfpId=(k as any).dfp_id??''

    const kursRows=bs.map(b=>`
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:600;color:#111">
          ${b.kurse.titel}
          ${b.kurse.untertitel?`<div style="font-size:10px;color:#666;font-weight:400;font-style:italic;margin-top:2px">"${b.kurse.untertitel}"</div>`:''}
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:11px;font-weight:600">${b.einheiten_besucht??0}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:11px;font-weight:700;color:#111">${b.dfp_erhalten??0}</td>
      </tr>`).join('')

    return`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Teilnahmebestätigung — ${t.nachname} ${t.vorname}</title>
<style>
  @page{size:A4;margin:15mm 20mm 25mm 20mm}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;line-height:1.5}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>

<!-- HEADER -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10mm;padding-bottom:6mm;border-bottom:2px solid #111">
  <div>
    <div style="font-size:10px;font-weight:700;letter-spacing:0.05em;color:#555">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
    <div style="font-size:10px;color:#777">Österreichische Gesellschaft für Sportmedizin und Prävention</div>
  </div>
  <img src="/logo.svg" style="height:14mm;width:auto" onerror="this.style.display='none'"/>
</div>

<!-- TITLE -->
<div style="text-align:center;margin-bottom:8mm">
  <div style="font-size:13px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:6mm">T E I L N A H M E B E S T Ä T I G U N G</div>
</div>

<!-- NAME -->
<div style="text-align:center;margin-bottom:6mm">
  <div style="font-size:16px;font-weight:700">${t.vorname} ${t.nachname}</div>
  <div style="font-size:11px;color:#555;margin-top:3px">ÖÄK-Nr.: ${t.oeak_nr}</div>
</div>

<!-- TEXT -->
<div style="text-align:center;font-size:12px;margin-bottom:8mm;line-height:2">
  hat im Rahmen des<br>
  <strong style="font-size:13px">${k.name}</strong><br>
  ${ort}, ${datum}<br>
  an folgenden Veranstaltungen teilgenommen:
</div>

<!-- KURSE TABELLE -->
<table style="width:100%;border-collapse:collapse;margin-bottom:8mm">
  <thead>
    <tr style="background:#111;color:#fff">
      <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Kurs / Veranstaltung</th>
      <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;width:100px">Stunden</th>
      <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;width:100px">DFP-Punkte</th>
    </tr>
  </thead>
  <tbody>
    ${kursRows}
    <tr style="background:#f5f5f5">
      <td style="padding:12px 16px;font-weight:700;font-size:12px">Gesamt</td>
      <td style="padding:12px 16px;text-align:center;font-weight:700;font-size:13px">${totalStunden}</td>
      <td style="padding:12px 16px;text-align:center;font-weight:700;font-size:15px">${total}</td>
    </tr>
  </tbody>
</table>

<!-- UNTERSCHRIFT -->
<div style="display:flex;justify-content:center;margin-top:12mm;margin-bottom:10mm">
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:70mm;padding-top:3mm">
      <div style="font-size:11px;font-weight:700;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
      <div style="font-size:10px;color:#555">Kongresspräsident</div>
    </div>
  </div>
</div>

<!-- ÖÄK BOX (fixed bottom) -->
<div style="position:fixed;bottom:15mm;left:20mm;right:20mm">
  <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;border:1.5px solid #333;padding:10px 14px;align-items:center">
    <div style="text-align:center">
      <div style="font-size:8px;font-weight:900;letter-spacing:0.05em;border:2px solid #111;padding:3px 6px;color:#111">ÖÄK DIPLOM</div>
      <div style="font-size:7px;font-weight:700;letter-spacing:0.08em;margin-top:2px">APPROBIERT</div>
    </div>
    <div style="font-size:10px;line-height:1.8">
      <div style="font-weight:700">Anrechenbar</div>
      <div style="display:flex;justify-content:space-between"><span>Fachspezifische Punkte</span><span style="font-weight:700">${total} Punkte</span></div>
      <div style="display:flex;justify-content:space-between"><span>ÖÄK – Diplom – Sportmedizin</span><span style="font-weight:700">${totalStunden} Stunden</span></div>
      ${dfpId?`<div style="display:flex;justify-content:space-between"><span style="font-weight:700">DFP – ID</span><span style="font-weight:700">${dfpId}</span></div>`:''}
    </div>
  </div>
  <!-- FOOTER -->
  <div style="display:grid;grid-template-columns:1fr 1fr;margin-top:6px;font-size:8px;color:#555">
    <div>
      <div>Michaelsgasse 20, 9900 Lienz, Österreich</div>
      <div>UID: ATU 61957546</div>
    </div>
    <div style="text-align:right">
      <div>Tel.: 04852 61952-52 · E-Mail: info@sportmedizin-arlberg.at</div>
      <div>Website: www.sportmedizin-arlberg.at</div>
    </div>
  </div>
</div>

</body>
</html>`
  }

  async function sendBestaetigung(t:Teilnehmer,tnId:number){
    if(!k)return
    setSending(tnId)
    const html=buildBestaetigung(t,tnId)
    await fetch('/api/send-bestaetigung',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:t.email,vorname:t.vorname,nachname:t.nachname,html,kongress_name:k.name,kongress_jahr:k.jahr})
    })
    setSending(null)
  }

  const filtered=teilnehmer.filter(t=>!q||`${t.vorname} ${t.nachname} ${t.oeak_nr}`.toLowerCase().includes(q.toLowerCase()))

  return(
    <div>
      <PageHeader title="Anwesenheit & DFP" sub={`${filtered.length} Teilnehmer`}>
        <input placeholder="Name oder ÖÄK-Nr." value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-60 focus:outline-none focus:border-[#FFBF00]"/>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filtered.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Keine Teilnehmer</div>}
            {filtered.map((t,i)=>{
              const isOpen=expanded===t.id
              const bs=buchungen[t.id]??[]
              const total=isOpen?calcDfpTotal(t.id):0
              return(
                <div key={t.id} className={i>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>toggleExpand(t)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">{t.nachname} {t.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">ÖÄK: {t.oeak_nr}</span>
                    </div>
                    {isOpen&&<span className="text-sm font-bold text-amber-700">{total} DFP gesamt</span>}
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Besuchte Kurse & Stunden</p>
                      <div className="space-y-2 mb-5">
                        {bs.length===0&&<p className="text-sm text-gray-400">Keine Buchungen</p>}
                        {bs.map(b=>{
                          const maxEinh=b.kurse.einheiten_gesamt
                          const dfpPro=b.kurse.dfp_punkte_gesamt&&maxEinh?(b.kurse.dfp_punkte_gesamt/maxEinh):0
                          const isPflicht=kurse.find(k=>k.id===b.kurs_id)?.ist_pflichtprogramm??false
                          return(
                            <div key={b.id} className={`bg-white border rounded-xl p-3 grid grid-cols-4 gap-3 items-center ${isPflicht?'border-blue-100':'border-gray-200'}`}>
                              <div className="col-span-2">
                                <p className="text-sm font-semibold">{b.kurse.titel}
                                  {isPflicht&&<span className="ml-2 text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">PFLICHT</span>}
                                </p>
                                {b.kurse.untertitel&&<p className="text-xs text-gray-400 italic">{b.kurse.untertitel}</p>}
                                <p className="text-[10px] text-gray-400">{b.kurse.uhrzeit??b.kurse.wochentag_datum}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="number" min={0} max={maxEinh} value={b.einheiten_besucht??''} placeholder="0"
                                  onChange={e=>updateEinheiten(t.id,b.id,Math.min(parseInt(e.target.value)||0,maxEinh),b.kurse)}
                                  className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#FFBF00]"/>
                                <span className="text-xs text-gray-400">/ {maxEinh} Std.</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-amber-700">{b.dfp_erhalten??0} DFP</span>
                                {b.kurse.dfp_punkte_gesamt&&<p className="text-[10px] text-gray-400">max. {b.kurse.dfp_punkte_gesamt}</p>}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <div>
                          <span className="text-sm font-bold">Gesamt: </span>
                          <span className="text-lg font-extrabold text-amber-700">{calcDfpTotal(t.id)} DFP</span>
                          <span className="text-xs text-gray-400 ml-2">/ {bs.reduce((s,b)=>s+(b.einheiten_besucht??0),0)} Stunden</span>
                        </div>
                        <div className="flex gap-2">
                          <Btn variant="outline" size="sm" disabled={saving===t.id} onClick={()=>saveAnwesenheit(t.id)}>
                            {saving===t.id?'Speichert…':savedMsg===t.id?'✓ Gespeichert':'💾 Speichern'}
                          </Btn>
                          <Btn variant="outline" size="sm" onClick={()=>{setPreview(buildBestaetigung(t,t.id));setPreviewName(`${t.nachname}_${t.vorname}`)}}>
                            📄 Vorschau
                          </Btn>
                          <Btn size="sm" disabled={sending===t.id} onClick={()=>sendBestaetigung(t,t.id)}>
                            {sending===t.id?'Sendet…':'📧 Bestätigung senden'}
                          </Btn>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* VORSCHAU */}
      {preview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold">Teilnahmebestätigung — {previewName}</h2>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>setPreview(null)}>← Schließen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(preview!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken / PDF</Btn>
              </div>
            </div>
            <iframe srcDoc={preview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

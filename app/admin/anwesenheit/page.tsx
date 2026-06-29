'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,type Kongress,type Kurs}from'@/lib/db'
import{Btn,Badge,Loader,PageHeader}from'@/lib/ui'

type Teilnehmer={id:number;vorname:string;nachname:string;oeak_nr:string;email:string}
type Buchung={id:number;kurs_id:number;zahlungsstatus:string;einheiten_besucht:number|null;dfp_erhalten:number|null;kurse:{titel:string;untertitel:string|null;dfp_punkte_gesamt:number|null;einheiten_gesamt:number;kurs_gruppe:string;uhrzeit:string|null;wochentag_datum:string}}
type PflichtAnwesenheit={kurs_id:number;einheiten_besucht:number|null}

export default function AnwesenheitPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[teilnehmer,setTeilnehmer]=useState<Teilnehmer[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[buchungen,setBuchungen]=useState<Record<number,Buchung[]>>({})
  const[pflichtAnw,setPflichtAnw]=useState<Record<number,PflichtAnwesenheit[]>>({})
  const[saving,setSaving]=useState<number|null>(null)
  const[preview,setPreview]=useState<string|null>(null)
  const[previewName,setPreviewName]=useState('')

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
      const{data}=await supabase.from('buchungen')
        .select('id,kurs_id,zahlungsstatus,einheiten_besucht,dfp_erhalten,kurse(titel,untertitel,dfp_punkte_gesamt,einheiten_gesamt,kurs_gruppe,uhrzeit,wochentag_datum)')
        .eq('teilnehmer_id',t.id).neq('zahlungsstatus','storniert')
      setBuchungen(prev=>({...prev,[t.id]:(data as unknown as Buchung[])??[]}))
      // Init Pflicht-Anwesenheit
      const initPflicht=pflichtkurse.map(pk=>({kurs_id:pk.id,einheiten_besucht:null}))
      setPflichtAnw(prev=>({...prev,[t.id]:initPflicht}))
    }
  }

  function updateEinheiten(tnId:number, buchungId:number, val:number, kurs:Buchung['kurse']){
    const dfpProEinheit=kurs.dfp_punkte_gesamt?(kurs.dfp_punkte_gesamt/kurs.einheiten_gesamt):0
    const dfp=Math.round(dfpProEinheit*val*10)/10
    setBuchungen(prev=>({...prev,[tnId]:prev[tnId].map(b=>b.id===buchungId?{...b,einheiten_besucht:val,dfp_erhalten:dfp}:b)}))
  }

  function updatePflicht(tnId:number, kursId:number, val:number){
    setPflichtAnw(prev=>({...prev,[tnId]:prev[tnId].map(p=>p.kurs_id===kursId?{...p,einheiten_besucht:val}:p)}))
  }

  async function saveAnwesenheit(tnId:number){
    setSaving(tnId)
    for(const b of buchungen[tnId]??[]){
      await supabase.from('buchungen').update({einheiten_besucht:b.einheiten_besucht,dfp_erhalten:b.dfp_erhalten}).eq('id',b.id)
    }
    setSaving(null)
  }

  function calcDfpTotal(tnId:number):number{
    const buchDfp=(buchungen[tnId]??[]).reduce((s,b)=>s+(b.dfp_erhalten??0),0)
    const pflichtDfp=(pflichtAnw[tnId]??[]).reduce((s,p)=>{
      const pk=pflichtkurse.find(k=>k.id===p.kurs_id)
      if(!pk||!pk.dfp_punkte_gesamt||p.einheiten_besucht===null)return s
      return s+Math.round((pk.dfp_punkte_gesamt/pk.einheiten_gesamt)*(p.einheiten_besucht)*10)/10
    },0)
    return Math.round((buchDfp+pflichtDfp)*10)/10
  }

  function buildBestaetigung(t:Teilnehmer, tnId:number, modus:'einzeln'|'gesamt'){
    if(!k)return''
    const bs=buchungen[tnId]??[]
    const datum=`${new Date(k.datum_von).toLocaleDateString('de-AT')}–${new Date(k.datum_bis).toLocaleDateString('de-AT')}`

    if(modus==='gesamt'){
      const alleKurse=[
        ...bs.map(b=>({titel:b.kurse.untertitel||b.kurse.titel,stunden:b.einheiten_besucht??0,dfp:b.dfp_erhalten??0,einheiten:b.kurse.einheiten_gesamt})),
        ...(pflichtAnw[tnId]??[]).map(p=>{
          const pk=pflichtkurse.find(k=>k.id===p.kurs_id)
          if(!pk||p.einheiten_besucht===null)return null
          const dfp=pk.dfp_punkte_gesamt?Math.round((pk.dfp_punkte_gesamt/pk.einheiten_gesamt)*(p.einheiten_besucht)*10)/10:0
          return{titel:pk.untertitel||pk.titel,stunden:p.einheiten_besucht,dfp,einheiten:pk.einheiten_gesamt}
        }).filter(Boolean)
      ].filter(x=>x&&x.stunden>0)
      const total=calcDfpTotal(tnId)
      const rows=alleKurse.map(x=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:11px">${x!.titel}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;font-size:11px">${x!.stunden}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center;font-size:11px;font-weight:bold">${x!.dfp}</td></tr>`).join('')
      return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm 20mm}body{font-family:Arial,sans-serif;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8mm">
        <img src="/logo.svg" style="height:16mm"/>
        <div style="text-align:right;font-size:10px;color:#555"><div>${k.name}</div><div>${datum}</div></div>
      </div>
      <h1 style="text-align:center;font-size:16px;letter-spacing:.15em;font-weight:bold;margin:8mm 0;text-transform:uppercase">Teilnahmebestätigung</h1>
      <p style="text-align:center;font-size:13px;margin:4mm 0"><strong>${t.vorname} ${t.nachname}</strong></p>
      <p style="text-align:center;font-size:11px;color:#555;margin:2mm 0">ÖÄK-Nr.: ${t.oeak_nr}</p>
      <p style="text-align:center;font-size:12px;margin:6mm 0">hat im Rahmen des<br><br><strong>${k.name}</strong><br><br>an folgenden Veranstaltungen teilgenommen:</p>
      <table style="width:100%;border-collapse:collapse;margin:6mm 0">
        <thead><tr style="background:#f5f5f5"><th style="padding:8px 12px;text-align:left;font-size:11px">Kurs / Veranstaltung</th><th style="padding:8px 12px;text-align:center;font-size:11px">Stunden</th><th style="padding:8px 12px;text-align:center;font-size:11px">DFP</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr style="background:#f5f5f5"><td style="padding:8px 12px;font-weight:bold;font-size:12px">Gesamt</td><td></td><td style="padding:8px 12px;text-align:center;font-weight:bold;font-size:13px">${total}</td></tr></tfoot>
      </table>
      <div style="margin-top:15mm;display:flex;justify-content:center"><div style="text-align:center">
        <div style="border-top:1px solid #333;width:60mm;margin-bottom:3mm"></div>
        <div style="font-size:10px;font-style:italic;font-weight:bold">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
        <div style="font-size:10px">Kongresspräsident</div>
      </div></div>
      <div style="position:fixed;bottom:10mm;left:20mm;right:20mm;border:1px solid #ccc;padding:6px 12px;font-size:9px;display:grid;grid-template-columns:auto 1fr 1fr">
        <img src="/logo.svg" style="height:10mm;margin-right:8px"/>
        <div><div style="font-weight:bold">ÖÄK DIPLOM APPROBIERT</div><div>Fachspezifische Punkte: ${total} Punkte</div><div>ÖÄK-Diplom Sportmedizin/Grundkurs</div></div>
        <div style="text-align:right"><div>Prof. h.c. Univ.-Doz. Dr. Neumayr · Günther</div><div>ID: ${t.oeak_nr}</div></div>
      </div>
      </body></html>`
    }

    // Einzeln - pro Kurs eine Seite
    const pages=[
      ...bs.filter(b=>b.einheiten_besucht&&b.einheiten_besucht>0).map(b=>{
        const stunden=b.einheiten_besucht??0
        const dfp=b.dfp_erhalten??0
        const titel=b.kurse.untertitel||b.kurse.titel
        return buildEinzelSeite(t,k,datum,titel,stunden,dfp)
      }),
      ...(pflichtAnw[tnId]??[]).filter(p=>p.einheiten_besucht&&p.einheiten_besucht>0).map(p=>{
        const pk=pflichtkurse.find(k=>k.id===p.kurs_id)
        if(!pk)return''
        const stunden=p.einheiten_besucht??0
        const dfp=pk.dfp_punkte_gesamt?Math.round((pk.dfp_punkte_gesamt/pk.einheiten_gesamt)*stunden*10)/10:0
        return buildEinzelSeite(t,k,datum,pk.untertitel||pk.titel,stunden,dfp)
      }).filter(Boolean)
    ]
    return`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm 20mm}.page{page-break-after:always}body{font-family:Arial,sans-serif;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>${pages.join('')}</body></html>`
  }

  function buildEinzelSeite(t:Teilnehmer,k:Kongress,datum:string,titel:string,stunden:number,dfp:number):string{
    return`<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8mm">
      <img src="/logo.svg" style="height:16mm"/>
      <div style="text-align:right;font-size:10px;color:#555"><div>${k.name}</div><div>${datum}</div></div>
    </div>
    <h1 style="text-align:center;font-size:16px;letter-spacing:.15em;font-weight:bold;margin:8mm 0;text-transform:uppercase">Teilnahmebestätigung</h1>
    <div style="text-align:center;margin:10mm 0;font-size:13px;line-height:2.2">
      <strong style="font-size:15px">${t.vorname} ${t.nachname}</strong><br>
      hat im Rahmen des<br><br>
      <strong>${k.name}</strong><br><br>
      am<br><br>
      <strong>${titel}</strong><br><br>
      im Ausmaß von ${stunden} Stunden teilgenommen.
    </div>
    <div style="margin-top:15mm;display:flex;justify-content:center"><div style="text-align:center">
      <div style="border-top:1px solid #333;width:60mm;margin-bottom:3mm"></div>
      <div style="font-size:10px;font-style:italic;font-weight:bold">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
      <div style="font-size:10px">Kongresspräsident</div>
    </div></div>
    <div style="position:fixed;bottom:10mm;left:20mm;right:20mm;border:1px solid #ccc;padding:6px 12px;font-size:9px;display:grid;grid-template-columns:auto 1fr 1fr">
      <img src="/logo.svg" style="height:10mm;margin-right:8px"/>
      <div><div style="font-weight:bold">ÖÄK DIPLOM APPROBIERT</div><div>Fachspezifische Punkte: ${dfp} Punkte</div><div>ÖÄK-Diplom Sportmedizin/Grundkurs</div></div>
      <div style="text-align:right"><div>Prof. h.c. Univ.-Doz. Dr. Neumayr · Günther</div><div>ID: ${t.oeak_nr}</div></div>
    </div>
    </div>`
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
                      {/* GEBUCHTE KURSE */}
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Gebuchte Kurse</p>
                      <div className="space-y-2 mb-5">
                        {bs.length===0&&<p className="text-sm text-gray-400">Keine Buchungen</p>}
                        {bs.map(b=>{
                          const dfpPro=b.kurse.dfp_punkte_gesamt?(b.kurse.dfp_punkte_gesamt/b.kurse.einheiten_gesamt):0
                          return(
                            <div key={b.id} className="bg-white border border-gray-200 rounded-xl p-3 grid grid-cols-4 gap-3 items-center">
                              <div className="col-span-2">
                                <p className="text-sm font-semibold">{b.kurse.titel}</p>
                                {b.kurse.untertitel&&<p className="text-xs text-gray-400">{b.kurse.untertitel}</p>}
                                <p className="text-[10px] text-gray-400">{b.kurse.uhrzeit??b.kurse.wochentag_datum}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="number" min={0} max={b.kurse.einheiten_gesamt} value={b.einheiten_besucht??''} onChange={e=>updateEinheiten(t.id,b.id,parseInt(e.target.value)||0,b.kurse)}
                                  className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#FFBF00]"/>
                                <span className="text-xs text-gray-400">/ {b.kurse.einheiten_gesamt} Einh.</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-amber-700">{b.dfp_erhalten??0} DFP</span>
                                {b.kurse.dfp_punkte_gesamt&&<p className="text-[10px] text-gray-400">max. {b.kurse.dfp_punkte_gesamt} DFP</p>}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* PFLICHTPROGRAMM */}
                      {pflichtkurse.length>0&&(
                        <>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Pflichtprogramm (inkludiert)</p>
                          <div className="space-y-2 mb-5">
                            {pflichtkurse.map(pk=>{
                              const pa=(pflichtAnw[t.id]??[]).find(p=>p.kurs_id===pk.id)
                              const val=pa?.einheiten_besucht??null
                              const dfp=pk.dfp_punkte_gesamt&&val!==null?Math.round((pk.dfp_punkte_gesamt/pk.einheiten_gesamt)*val*10)/10:0
                              return(
                                <div key={pk.id} className="bg-white border border-gray-200 rounded-xl p-3 grid grid-cols-4 gap-3 items-center">
                                  <div className="col-span-2">
                                    <p className="text-sm font-semibold">{pk.titel}</p>
                                    {pk.untertitel&&<p className="text-xs text-gray-400">{pk.untertitel}</p>}
                                    <p className="text-[10px] text-gray-400">{pk.uhrzeit??pk.wochentag_datum}</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {pk.einheiten_gesamt===1
                                      ?<label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={val===1} onChange={e=>updatePflicht(t.id,pk.id,e.target.checked?1:0)} className="accent-amber-500"/>
                                        Anwesend
                                      </label>
                                      :<><input type="number" min={0} max={pk.einheiten_gesamt} value={val??''} onChange={e=>updatePflicht(t.id,pk.id,parseInt(e.target.value)||0)}
                                        className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#FFBF00]"/>
                                        <span className="text-xs text-gray-400">/ {pk.einheiten_gesamt} Einh.</span>
                                      </>
                                    }
                                  </div>
                                  <div className="text-right">
                                    <span className="text-sm font-bold text-amber-700">{dfp} DFP</span>
                                    {pk.dfp_punkte_gesamt&&<p className="text-[10px] text-gray-400">max. {pk.dfp_punkte_gesamt} DFP</p>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}

                      {/* GESAMT + AKTIONEN */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <div>
                          <span className="text-sm font-bold">Gesamt: </span>
                          <span className="text-lg font-extrabold text-amber-700">{calcDfpTotal(t.id)} DFP</span>
                        </div>
                        <div className="flex gap-2">
                          <Btn variant="outline" size="sm" disabled={saving===t.id} onClick={()=>saveAnwesenheit(t.id)}>{saving===t.id?'Speichert…':'💾 Speichern'}</Btn>
                          <Btn variant="outline" size="sm" onClick={()=>{setPreview(buildBestaetigung(t,t.id,'einzeln'));setPreviewName(`${t.nachname}_${t.vorname}_einzeln`)}}>📄 Einzeln drucken</Btn>
                          <Btn size="sm" onClick={()=>{setPreview(buildBestaetigung(t,t.id,'gesamt'));setPreviewName(`${t.nachname}_${t.vorname}_gesamt`)}}>📋 Gesamtbestätigung</Btn>
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
              <h2 className="font-bold">Vorschau — {previewName}</h2>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>setPreview(null)}>← Schließen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(preview!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>
              </div>
            </div>
            <iframe srcDoc={preview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

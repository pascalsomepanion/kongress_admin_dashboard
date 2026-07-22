'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,type Kongress,type Kurs}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader}from'@/lib/ui'

type Referent={id:number;vorname:string;nachname:string;email:string;oeak_nr:string;anrede:string;kongress_id:number}
type RefAnwesenheit={id:number;referent_id:number;kurs_id:number;einheiten_besucht:number;dfp_erhalten:number}
const EMPTY_REF={vorname:'',nachname:'',email:'',oeak_nr:'',anrede:'Herr',kongress_id:0}

export default function ReferentenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[list,setList]=useState<Referent[]>([])
  const[loading,setLoading]=useState(true)
  const[edit,setEdit]=useState<Partial<Referent>|null>(null)
  const[saving,setSaving]=useState(false)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[anwesenheit,setAnwesenheit]=useState<Record<number,RefAnwesenheit[]>>({})
  const[savingAnw,setSavingAnw]=useState<number|null>(null)
  const[preview,setPreview]=useState<string|null>(null)
  const[previewName,setPreviewName]=useState('')
  const[sending,setSending]=useState<number|null>(null)

  // Only Pflichtkurse can be attended by Referenten (RSS, Ärztesport, Ski Alpin + Festvortrag)
  const pflichtkurse=kurse.filter(k=>k.ist_pflichtprogramm)
  // Also RSS (block, not pflicht but relevant)
  const relevanteKurse=[...pflichtkurse,...kurse.filter(k=>k.kurs_gruppe==='block')]

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[{data:refs},allKurse]=await Promise.all([
      supabase.from('referenten').select('*').eq('kongress_id',k.id).order('nachname'),
      getKurse(k.id)
    ])
    setList((refs as Referent[])??[])
    setKurse(allKurse)
    setLoading(false)
  })},[])

  async function save(){
    if(!edit||!k)return
    setSaving(true)
    if(edit.id){
      await supabase.from('referenten').update({vorname:edit.vorname,nachname:edit.nachname,email:edit.email,oeak_nr:edit.oeak_nr,anrede:edit.anrede}).eq('id',edit.id)
      setList(prev=>prev.map(r=>r.id===edit.id?{...r,...edit} as Referent:r))
    } else {
      const{data}=await supabase.from('referenten').insert({...edit,kongress_id:k.id}).select('*').single()
      if(data)setList(prev=>[...prev,data as Referent])
    }
    setEdit(null);setSaving(false)
  }

  async function del(id:number){
    if(!confirm('Referent wirklich löschen?'))return
    await supabase.from('referenten_anwesenheit').delete().eq('referent_id',id)
    await supabase.from('referenten').delete().eq('id',id)
    setList(prev=>prev.filter(r=>r.id!==id))
  }

  async function toggleExpand(r:Referent){
    if(expanded===r.id){setExpanded(null);return}
    setExpanded(r.id)
    if(!anwesenheit[r.id]){
      const{data}=await supabase.from('referenten_anwesenheit').select('*').eq('referent_id',r.id)
      setAnwesenheit(prev=>({...prev,[r.id]:(data as RefAnwesenheit[])??[]}))
    }
  }

  function getAnw(refId:number,kursId:number):RefAnwesenheit|undefined{
    return (anwesenheit[refId]??[]).find(a=>a.kurs_id===kursId)
  }

  function updateAnw(refId:number,kursId:number,einheiten:number,kurs:Kurs){
    const dfp=kurs.dfp_punkte_gesamt&&kurs.einheiten_gesamt?Math.round((kurs.dfp_punkte_gesamt/kurs.einheiten_gesamt)*einheiten*10)/10:0
    setAnwesenheit(prev=>{
      const curr=prev[refId]??[]
      const existing=curr.find(a=>a.kurs_id===kursId)
      if(existing){return{...prev,[refId]:curr.map(a=>a.kurs_id===kursId?{...a,einheiten_besucht:einheiten,dfp_erhalten:dfp}:a)}}
      return{...prev,[refId]:[...curr,{id:0,referent_id:refId,kurs_id:kursId,einheiten_besucht:einheiten,dfp_erhalten:dfp}]}
    })
  }

  async function saveAnwesenheit(refId:number){
    setSavingAnw(refId)
    for(const a of anwesenheit[refId]??[]){
      if(a.einheiten_besucht>0){
        await supabase.from('referenten_anwesenheit').upsert({referent_id:refId,kurs_id:a.kurs_id,einheiten_besucht:a.einheiten_besucht,dfp_erhalten:a.dfp_erhalten},{onConflict:'referent_id,kurs_id'})
      } else {
        await supabase.from('referenten_anwesenheit').delete().eq('referent_id',refId).eq('kurs_id',a.kurs_id)
      }
    }
    setSavingAnw(null)
  }

  function buildBestaetigung(r:Referent,refId:number):string{
    if(!k)return''
    const anwList=(anwesenheit[refId]??[]).filter(a=>a.einheiten_besucht>0)
    const datum=`${new Date(k.datum_von).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})} – ${new Date(k.datum_bis).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}`
    const ort=k.ort??'St. Christoph am Arlberg'
    const anredeText=`${r.anrede} ${r.vorname} ${r.nachname}`
    const dfpId=(k as any).dfp_id??''

    const kursRows=anwList.map(a=>{
      const kurs=kurse.find(kk=>kk.id===a.kurs_id)
      if(!kurs)return''
      return`<tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:600">${kurs.titel}${kurs.untertitel?`<div style="font-size:10px;color:#666;font-style:italic">"${kurs.untertitel}"</div>`:''}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:11px;font-weight:600">${a.einheiten_besucht}</td>
        <td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:11px;font-weight:700">${a.dfp_erhalten}</td>
      </tr>`}).join('')

    const totalStunden=anwList.reduce((s,a)=>s+a.einheiten_besucht,0)
    const totalDfp=Math.round(anwList.reduce((s,a)=>s+a.dfp_erhalten,0)*10)/10

    return`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>Teilnahmebestätigung — ${r.nachname} ${r.vorname}</title>
<style>@page{size:A4;margin:15mm 20mm 25mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;line-height:1.5}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10mm;padding-bottom:6mm;border-bottom:2px solid #111">
  <div>
    <div style="font-size:10px;font-weight:700;letter-spacing:0.05em;color:#555">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
    <div style="font-size:10px;color:#777">Österreichische Gesellschaft für Sportmedizin und Prävention</div>
  </div>
  <img src="/logo.svg" style="height:14mm;width:auto" onerror="this.style.display='none'"/>
</div>

<div style="text-align:center;margin-bottom:8mm">
  <div style="font-size:13px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;margin-bottom:6mm">T E I L N A H M E B E S T Ä T I G U N G</div>
</div>

<div style="text-align:center;margin-bottom:8mm">
  <div style="font-size:16px;font-weight:700">${anredeText}</div>
  ${r.oeak_nr?`<div style="font-size:11px;color:#555;margin-top:3px">ÖÄK-Nr.: ${r.oeak_nr}</div>`:''}
</div>

<div style="text-align:center;font-size:12px;margin-bottom:8mm;line-height:2.2">
  hat vom ${new Date(k.datum_von).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})} bis ${new Date(k.datum_bis).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})} am<br>
  <strong style="font-size:13px">${k.name}</strong><br>
  ${ort}<br>
  als Referent/Referentin teilgenommen.
</div>

${anwList.length>0?`
<div style="text-align:center;font-size:11px;margin-bottom:6mm;color:#555">
  Zusätzlich wurden folgende Veranstaltungen besucht:
</div>
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
      <td style="padding:12px 16px;font-weight:700">Gesamt</td>
      <td style="padding:12px 16px;text-align:center;font-weight:700;font-size:13px">${totalStunden}</td>
      <td style="padding:12px 16px;text-align:center;font-weight:700;font-size:15px">${totalDfp}</td>
    </tr>
  </tbody>
</table>`:''}

<div style="text-align:right;font-size:11px;color:#555;margin-bottom:12mm">${ort}, den ${new Date(k.datum_bis).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}</div>

<div style="display:flex;justify-content:center;margin-bottom:10mm">
  <div style="text-align:center">
    <div style="border-top:1px solid #333;width:70mm;padding-top:3mm">
      <div style="font-size:11px;font-weight:700;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div>
      <div style="font-size:10px;color:#555">Kongresspräsident</div>
    </div>
  </div>
</div>

${anwList.length>0?`
<div style="position:fixed;bottom:15mm;left:20mm;right:20mm">
  <div style="display:grid;grid-template-columns:auto 1fr;gap:12px;border:1.5px solid #333;padding:10px 14px;align-items:center">
    <div style="text-align:center">
      <div style="font-size:8px;font-weight:900;letter-spacing:0.05em;border:2px solid #111;padding:3px 6px">ÖÄK DIPLOM</div>
      <div style="font-size:7px;font-weight:700;letter-spacing:0.08em;margin-top:2px">APPROBIERT</div>
    </div>
    <div style="font-size:10px;line-height:1.8">
      <div style="font-weight:700">Anrechenbar</div>
      <div style="display:flex;justify-content:space-between"><span>Fachspezifische Punkte</span><span style="font-weight:700">${totalDfp} Punkte</span></div>
      <div style="display:flex;justify-content:space-between"><span>ÖÄK – Diplom – Sportmedizin</span><span style="font-weight:700">${totalStunden} Stunden</span></div>
      ${dfpId?`<div style="display:flex;justify-content:space-between"><span style="font-weight:700">DFP – ID</span><span style="font-weight:700">${dfpId}</span></div>`:''}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;margin-top:6px;font-size:8px;color:#555">
    <div><div>Michaelsgasse 20, 9900 Lienz, Österreich</div><div>UID: ATU 61957546</div></div>
    <div style="text-align:right"><div>Tel.: 04852 61952-52 · E-Mail: info@sportmedizin-arlberg.at</div><div>Website: www.sportmedizin-arlberg.at</div></div>
  </div>
</div>`:`
<div style="position:fixed;bottom:10mm;left:20mm;right:20mm;display:grid;grid-template-columns:1fr 1fr;font-size:8px;color:#555;border-top:1px solid #ccc;padding-top:4px">
  <div><div>Michaelsgasse 20, 9900 Lienz, Österreich</div><div>UID: ATU 61957546</div></div>
  <div style="text-align:right"><div>Tel.: 04852 61952-52 · E-Mail: info@sportmedizin-arlberg.at</div><div>Website: www.sportmedizin-arlberg.at</div></div>
</div>`}

</body></html>`
  }

  async function sendBestaetigung(r:Referent){
    if(!k)return
    setSending(r.id)
    const html=buildBestaetigung(r,r.id)
    await fetch('/api/send-bestaetigung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:r.email,vorname:r.vorname,nachname:r.nachname,html,kongress_name:k.name,kongress_jahr:k.jahr})})
    setSending(null)
  }

  return(
    <div>
      <PageHeader title="Referenten" sub={`${list.length} Referenten`}>
        <Btn onClick={()=>setEdit({...EMPTY_REF})}>+ Referent anlegen</Btn>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {list.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Noch keine Referenten</div>}
            {list.map((r,i)=>{
              const isOpen=expanded===r.id
              const anwList=(anwesenheit[r.id]??[]).filter(a=>a.einheiten_besucht>0)
              return(
                <div key={r.id} className={i>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>toggleExpand(r)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">{r.anrede} {r.nachname} {r.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{r.email}</span>
                    </div>
                    <div className="flex items-center gap-2" onClick={e=>e.stopPropagation()}>
                      {anwList.length>0&&<Badge label={`${anwList.length} Kurs${anwList.length!==1?'e':''}`} variant="blue"/>}
                      <Btn size="sm" variant="outline" onClick={()=>setEdit({...r})}>Bearbeiten</Btn>
                      <Btn size="sm" variant="danger" onClick={()=>del(r.id)}>Löschen</Btn>
                    </div>
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Besuchte Kurse (optional)</p>
                      <div className="space-y-2 mb-4">
                        {relevanteKurse.map(kurs=>{
                          const a=getAnw(r.id,kurs.id)
                          const val=a?.einheiten_besucht??0
                          const dfp=a?.dfp_erhalten??0
                          return(
                            <div key={kurs.id} className="bg-white border border-gray-200 rounded-xl p-3 grid grid-cols-4 gap-3 items-center">
                              <div className="col-span-2">
                                <p className="text-sm font-semibold">{kurs.titel}</p>
                                <p className="text-[10px] text-gray-400">{kurs.uhrzeit??kurs.wochentag_datum}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                {kurs.einheiten_gesamt===1
                                  ?<label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={val===1} onChange={e=>updateAnw(r.id,kurs.id,e.target.checked?1:0,kurs)} className="accent-amber-500"/>
                                    Anwesend
                                  </label>
                                  :<><input type="number" min={0} max={kurs.einheiten_gesamt} value={val||''} placeholder="0"
                                    onChange={e=>updateAnw(r.id,kurs.id,Math.min(parseInt(e.target.value)||0,kurs.einheiten_gesamt),kurs)}
                                    className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#FFBF00]"/>
                                    <span className="text-xs text-gray-400">/ {kurs.einheiten_gesamt} Std.</span>
                                  </>
                                }
                              </div>
                              <div className="text-right">
                                {dfp>0&&<span className="text-sm font-bold text-amber-700">{dfp} DFP</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                        <Btn variant="outline" size="sm" disabled={savingAnw===r.id} onClick={()=>saveAnwesenheit(r.id)}>
                          {savingAnw===r.id?'Speichert…':'💾 Speichern'}
                        </Btn>
                        <div className="flex gap-2">
                          <Btn variant="outline" size="sm" onClick={()=>{setPreview(buildBestaetigung(r,r.id));setPreviewName(`${r.nachname}_${r.vorname}`)}}>
                            📄 Vorschau
                          </Btn>
                          <Btn size="sm" disabled={sending===r.id||!r.email} onClick={()=>sendBestaetigung(r)}>
                            {sending===r.id?'Sendet…':'📧 Bestätigung senden'}
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

      {/* EDIT MODAL */}
      {edit&&(
        <Modal title={edit.id?'Referent bearbeiten':'Neuer Referent'} onClose={()=>setEdit(null)}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-gray-500 mb-2">Anrede</p>
              <div className="flex gap-2">
                {(['Herr','Frau','Dr.','Prof.'] as const).map(a=>(
                  <button key={a} onClick={()=>setEdit({...edit,anrede:a})} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${edit.anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
                ))}
              </div>
            </div>
            <Field label="Vorname *" id="r-vn" value={edit.vorname??''} onChange={v=>setEdit({...edit,vorname:v})}/>
            <Field label="Nachname *" id="r-nn" value={edit.nachname??''} onChange={v=>setEdit({...edit,nachname:v})}/>
            <Field label="E-Mail" id="r-em" value={edit.email??''} onChange={v=>setEdit({...edit,email:v})} span2 type="email"/>
            <Field label="ÖÄK-Nr." id="r-ok" value={edit.oeak_nr??''} onChange={v=>setEdit({...edit,oeak_nr:v})} span2/>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn>
            <Btn onClick={save} disabled={saving||!edit.vorname||!edit.nachname}>{saving?'Speichert…':'Speichern'}</Btn>
          </div>
        </Modal>
      )}

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

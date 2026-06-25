'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,getMwstTyp,type Kongress,type Sponsor,type SponsorRechnung}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'
type MwstTyp='mit_mwst'|'reverse_charge'|'nicht_steuerbar'
const PAKETE=[{label:'Online-Werbung (Website + Programmheft digital)',betrag:500},{label:'Logoplatzierung im Programmheft (Print)',betrag:800},{label:'Ausstellungsstand am Kongress',betrag:1500},{label:'Ausstellungsstand + Programmheft + Online (Kombination)',betrag:2200},{label:'Individuell — Betrag frei eingeben',betrag:0}]
const MWST_LABEL:Record<string,string>={mit_mwst:'AT + 20% MwSt.',reverse_charge:'EU Reverse Charge',nicht_steuerbar:'Nicht-EU'}
export default function SponsorenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[sponsoren,setSponsoren]=useState<Sponsor[]>([])
  const[rechnungen,setRechnungen]=useState<SponsorRechnung[]>([])
  const[loading,setLoading]=useState(true)
  const[editSp,setEditSp]=useState<Partial<Sponsor>|null>(null)
  const[newR,setNewR]=useState<{sponsor:Sponsor}|null>(null)
  const[rForm,setRForm]=useState({beschreibung:'',betrag:0,mwst_typ:'mit_mwst' as MwstTyp})
  const[preview,setPreview]=useState<string|null>(null)
  const[previewData,setPreviewData]=useState<{nr:string;netto:number;brutto:number;mwst:MwstTyp}|null>(null)
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<number|null>(null)
  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k)
    const[{data:sp},{data:re}]=await Promise.all([supabase.from('sponsoren').select('*').eq('kongress_id',k.id).order('firmenname'),supabase.from('sponsoren_rechnungen').select('*').eq('kongress_id',k.id).order('erstellt_am',{ascending:false})])
    setSponsoren((sp as Sponsor[])??[]);setRechnungen((re as SponsorRechnung[])??[]);setLoading(false)
  })},[])
  async function saveSponsor(){
    if(!editSp||!k)return;setSaving(true)
    if(editSp.id){await supabase.from('sponsoren').update(editSp).eq('id',editSp.id);setSponsoren(prev=>prev.map(s=>s.id===editSp.id?{...s,...editSp}as Sponsor:s))}
    else{const{data}=await supabase.from('sponsoren').insert({...editSp,kongress_id:k.id}).select().single();if(data)setSponsoren(prev=>[...prev,data as Sponsor])}
    setEditSp(null);setSaving(false)
  }
  async function delSponsor(id:number){
    if(!confirm('Sponsor und alle Rechnungen löschen?'))return
    await supabase.from('sponsoren_rechnungen').delete().eq('sponsor_id',id)
    await supabase.from('sponsoren').delete().eq('id',id)
    setSponsoren(prev=>prev.filter(s=>s.id!==id));setRechnungen(prev=>prev.filter(r=>r.sponsor_id!==id))
  }
  function startR(sp:Sponsor){const m=getMwstTyp(sp.land);setRForm({beschreibung:'',betrag:0,mwst_typ:m});setNewR({sponsor:sp})}
  async function createPreview(){
    if(!newR||!k)return
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=nextRechnungsnr(existing,k.jahr,true)
    const sp=newR.sponsor
    const netto=rForm.betrag
    const brutto=rForm.mwst_typ==='mit_mwst'?netto*1.2:netto
    const html=buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),anrede:'Damen und Herren',
      empfaenger_name:sp.firmenname,empfaenger_zeile2:sp.ansprechperson??undefined,
      empfaenger_strasse:`${sp.strasse} ${sp.hausnummer??''}`,empfaenger_plz_ort:`${sp.plz} ${sp.ort}`,empfaenger_land:sp.land,
      empfaenger_kennung:sp.uid_nr?`UID: ${sp.uid_nr}`:undefined,
      positionen:[{bezeichnung:rForm.beschreibung,menge:1,einzelpreis:netto}],
      mwst_typ:rForm.mwst_typ,bezahlt:false,kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`vielen Dank für Ihre Bereitschaft und Ihr Interesse, den ${k.name} ${k.jahr} zu fördern.\n\nFür die vereinbarten Leistungen dürfen wir wunschgemäß nachstehende Rechnung stellen und höflich um Überweisung des gesamten Rechnungsbetrages auf das nachstehend angeführte Konto ersuchen.`,
    })
    setPreviewData({nr,netto,brutto,mwst:rForm.mwst_typ})
    setPreview(html)
  }
  async function saveSpR(){
    if(!previewData||!newR||!k)return;setSaving(true)
    const{data}=await supabase.from('sponsoren_rechnungen').insert({sponsor_id:newR.sponsor.id,rechnungsnummer:previewData.nr,betrag_netto:previewData.netto,betrag_brutto:previewData.brutto,mwst_typ:previewData.mwst,beschreibung:rForm.beschreibung,zahlungsstatus:'ausstehend',kongress_id:k.id,erstellt_am:new Date().toISOString()}).select().single()
    if(data)setRechnungen(prev=>[data as SponsorRechnung,...prev])
    const win=window.open('','_blank');if(win){win.document.write(preview!);win.document.close();setTimeout(()=>win.print(),600)}
    setPreview(null);setPreviewData(null);setNewR(null);setSaving(false)
  }
  async function setSpStatus(id:number,s:string){
    await supabase.from('sponsoren_rechnungen').update({zahlungsstatus:s,bezahlt_am:s==='bezahlt'?new Date().toISOString():null}).eq('id',id)
    setRechnungen(prev=>prev.map(r=>r.id===id?{...r,zahlungsstatus:s}:r))
  }
  async function sendSpR(r:SponsorRechnung){
    const sp=sponsoren.find(s=>s.id===r.sponsor_id);if(!sp||!k)return;setSending(r.id)
    const html=buildRechnungHTML({rechnungsnummer:r.rechnungsnummer??'',datum:new Date(r.erstellt_am).toLocaleDateString('de-AT'),anrede:'Damen und Herren',empfaenger_name:sp.firmenname,empfaenger_strasse:`${sp.strasse} ${sp.hausnummer??''}`,empfaenger_plz_ort:`${sp.plz} ${sp.ort}`,empfaenger_land:sp.land,empfaenger_kennung:sp.uid_nr?`UID: ${sp.uid_nr}`:undefined,positionen:[{bezeichnung:r.beschreibung,menge:1,einzelpreis:r.betrag_netto}],mwst_typ:r.mwst_typ as MwstTyp,bezahlt:r.zahlungsstatus==='bezahlt',kongress_name:k.name,kongress_jahr:k.jahr,intro_text:`vielen Dank für Ihre Unterstützung des ${k.name} ${k.jahr}.`})
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:sp.email,vorname:'',nachname:sp.firmenname,rechnungsnummer:r.rechnungsnummer,html,kongress_name:k.name})})
    setSending(null)
  }
  return(
    <div>
      <PageHeader title="Sponsoren"><Btn onClick={()=>setEditSp({land:'Österreich'})}>+ Sponsor anlegen</Btn></PageHeader>
      <div className="p-6 space-y-6">
        {loading?<Loader/>:<>
          {/* SPONSORENLISTE */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Sponsoren ({sponsoren.length})</h2></div>
            <Table headers={['Firma','Ansprechperson','E-Mail','Land','MwSt-Typ','UID-Nr.','']} empty={sponsoren.length===0}>
              {sponsoren.map(s=>(
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{s.firmenname}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.ansprechperson??'—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.email}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.land}</td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-600">{MWST_LABEL[getMwstTyp(s.land)]}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.uid_nr??<span className={getMwstTyp(s.land)==='reverse_charge'?'text-red-500 font-semibold':'text-gray-300'}>{getMwstTyp(s.land)==='reverse_charge'?'⚠ Pflicht':'—'}</span>}</td>
                  <td className="px-4 py-3"><div className="flex gap-1.5"><Btn size="sm" onClick={()=>startR(s)}>+ Rechnung</Btn><Btn size="sm" variant="outline" onClick={()=>setEditSp({...s})}>Bearbeiten</Btn><Btn size="sm" variant="danger" onClick={()=>delSponsor(s.id)}>Löschen</Btn></div></td>
                </tr>
              ))}
            </Table>
          </div>
          {/* RECHNUNGEN */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Sponsoren-Rechnungen ({rechnungen.length})</h2></div>
            <Table headers={['Nr.','Firma','Beschreibung','Netto','Brutto','MwSt-Typ','Status','']} empty={rechnungen.length===0}>
              {rechnungen.map(r=>{const sp=sponsoren.find(s=>s.id===r.sponsor_id);return(
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold">{r.rechnungsnummer??'—'}</td>
                  <td className="px-4 py-3 font-medium text-sm">{sp?.firmenname??'—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{r.beschreibung}</td>
                  <td className="px-4 py-3 font-semibold text-sm">€ {r.betrag_netto.toFixed(2)}</td>
                  <td className="px-4 py-3 font-bold text-sm">€ {(r.betrag_brutto??r.betrag_netto).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{MWST_LABEL[r.mwst_typ]??r.mwst_typ}</td>
                  <td className="px-4 py-3"><Badge label={r.zahlungsstatus==='bezahlt'?'Bezahlt':'Ausstehend'} variant={r.zahlungsstatus==='bezahlt'?'green':'yellow'}/></td>
                  <td className="px-4 py-3"><div className="flex gap-1.5">
                    {r.zahlungsstatus!=='bezahlt'&&<Btn size="sm" onClick={()=>setSpStatus(r.id,'bezahlt')}>✓ Bezahlt</Btn>}
                    {r.zahlungsstatus==='bezahlt'&&<Btn size="sm" variant="outline" onClick={()=>setSpStatus(r.id,'ausstehend')}>Zurücksetzen</Btn>}
                    <Btn size="sm" variant="outline" disabled={sending===r.id} onClick={()=>sendSpR(r)}>{sending===r.id?'Sendet…':'📧 Senden'}</Btn>
                  </div></td>
                </tr>
              )})}
            </Table>
          </div>
        </>}
      </div>
      {/* SPONSOR BEARBEITEN */}
      {editSp&&(
        <Modal title={editSp.id?'Sponsor bearbeiten':'Sponsor anlegen'} onClose={()=>setEditSp(null)}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Firmenname *" id="sp-fn" value={editSp.firmenname??''} onChange={v=>setEditSp({...editSp,firmenname:v})} span2/>
            <Field label="Ansprechperson" id="sp-ap" value={editSp.ansprechperson??''} onChange={v=>setEditSp({...editSp,ansprechperson:v})} span2/>
            <Field label="E-Mail *" id="sp-em" value={editSp.email??''} onChange={v=>setEditSp({...editSp,email:v})} span2 type="email"/>
            <Field label="Straße *" id="sp-st" value={editSp.strasse??''} onChange={v=>setEditSp({...editSp,strasse:v})}/>
            <Field label="Hausnummer" id="sp-hn" value={editSp.hausnummer??''} onChange={v=>setEditSp({...editSp,hausnummer:v})}/>
            <Field label="PLZ *" id="sp-plz" value={editSp.plz??''} onChange={v=>setEditSp({...editSp,plz:v})}/>
            <Field label="Ort *" id="sp-ort" value={editSp.ort??''} onChange={v=>setEditSp({...editSp,ort:v})}/>
            <Field label="Land *" id="sp-ld" value={editSp.land??''} onChange={v=>setEditSp({...editSp,land:v})} span2/>
            <Field label="UID-Nr." id="sp-uid" value={editSp.uid_nr??''} onChange={v=>setEditSp({...editSp,uid_nr:v})} span2/>
            {editSp.land&&getMwstTyp(editSp.land)==='reverse_charge'&&!editSp.uid_nr&&(
              <div className="col-span-2 bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl">⚠ EU-Land erkannt — UID-Nr. ist für Reverse-Charge-Rechnung Pflicht!</div>
            )}
          </div>
          <div className="flex gap-3 justify-end"><Btn variant="outline" onClick={()=>setEditSp(null)}>Abbrechen</Btn><Btn onClick={saveSponsor} disabled={saving}>{saving?'Speichert…':'Speichern'}</Btn></div>
        </Modal>
      )}
      {/* RECHNUNG ERSTELLEN */}
      {newR&&!preview&&(
        <Modal title={`Rechnung — ${newR.sponsor.firmenname}`} onClose={()=>setNewR(null)}>
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Paket-Vorlage</p>
            <div className="space-y-1.5">{PAKETE.map(p=>(
              <button key={p.label} onClick={()=>setRForm(prev=>({...prev,beschreibung:p.label,betrag:p.betrag>0?p.betrag:prev.betrag}))}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${rForm.beschreibung===p.label?'border-[#FFBF00] bg-[#FFF9E6]':'border-gray-200 hover:bg-gray-50'}`}>
                <span>{p.label}</span>{p.betrag>0&&<span className="float-right font-semibold text-gray-700">€ {p.betrag}</span>}
              </button>
            ))}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1.5">Beschreibung (erscheint auf Rechnung) *</label><input value={rForm.beschreibung} onChange={e=>setRForm({...rForm,beschreibung:e.target.value})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Betrag netto (€) *</label><input type="number" value={rForm.betrag||''} onChange={e=>setRForm({...rForm,betrag:parseFloat(e.target.value)||0})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">MwSt.-Typ</label>
              <select value={rForm.mwst_typ} onChange={e=>setRForm({...rForm,mwst_typ:e.target.value as MwstTyp})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]">
                <option value="mit_mwst">Österreich (+20% MwSt.)</option>
                <option value="reverse_charge">EU – Reverse Charge</option>
                <option value="nicht_steuerbar">Nicht-EU – nicht steuerbar</option>
              </select>
            </div>
          </div>
          {rForm.mwst_typ==='mit_mwst'&&rForm.betrag>0&&(
            <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 mb-3">
              <div className="flex justify-between"><span>Netto</span><span>€ {rForm.betrag.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>+ 20% MwSt.</span><span>€ {(rForm.betrag*0.2).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Brutto</span><span>€ {(rForm.betrag*1.2).toFixed(2)}</span></div>
            </div>
          )}
          {rForm.mwst_typ==='reverse_charge'&&!newR.sponsor.uid_nr&&(
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-3">⚠ UID-Nr. des Sponsors fehlt — bitte zuerst beim Sponsor hinterlegen!</div>
          )}
          <div className="flex gap-3 justify-end"><Btn variant="outline" onClick={()=>setNewR(null)}>Abbrechen</Btn><Btn onClick={createPreview} disabled={!rForm.beschreibung||rForm.betrag<=0||(rForm.mwst_typ==='reverse_charge'&&!newR.sponsor.uid_nr)}>Vorschau →</Btn></div>
        </Modal>
      )}
      {/* VORSCHAU */}
      {preview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b"><div><h2 className="font-bold">Vorschau — {previewData?.nr}</h2><p className="text-xs text-gray-400">Bitte überprüfen</p></div><div className="flex gap-3"><Btn variant="outline" onClick={()=>setPreview(null)}>← Zurück</Btn><Btn onClick={saveSpR} disabled={saving}>{saving?'Speichert…':'✓ Speichern & Drucken'}</Btn></div></div>
            <iframe srcDoc={preview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,getMwstTyp,type Kongress,type Sponsor,type SponsorRechnung}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'
type MwstTyp='mit_mwst'|'reverse_charge'|'nicht_steuerbar'
const MWST_LABEL:Record<string,string>={mit_mwst:'AT + 20% MwSt.',reverse_charge:'EU Reverse Charge',nicht_steuerbar:'Nicht-EU'}

export default function SponsorenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[sponsoren,setSponsoren]=useState<Sponsor[]>([])
  const[rechnungen,setRechnungen]=useState<SponsorRechnung[]>([])
  const[loading,setLoading]=useState(true)
  const[editSp,setEditSp]=useState<Partial<Sponsor>|null>(null)
  const[newR,setNewR]=useState<{sponsor:Sponsor;editRechnung?:SponsorRechnung}|null>(null)
  const[rForm,setRForm]=useState({beschreibung:'',betrag:0,mwst_typ:'mit_mwst' as MwstTyp})
  const[preview,setPreview]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<number|null>(null)
  const[stornoTarget,setStornoTarget]=useState<SponsorRechnung|null>(null)
  const[stornoPreview,setStornoPreview]=useState<string|null>(null)
  const[stornoNr,setStornoNr]=useState('')

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return};setK(k)
    await load(k.id);setLoading(false)
  })},[])

  async function load(kid:number){
    const[{data:sp},{data:re}]=await Promise.all([
      supabase.from('sponsoren').select('*').eq('kongress_id',kid).order('firmenname'),
      supabase.from('sponsoren_rechnungen').select('*').eq('kongress_id',kid).order('erstellt_am',{ascending:false}),
    ])
    setSponsoren((sp as Sponsor[])??[])
    setRechnungen((re as SponsorRechnung[])??[])
  }

  async function saveSponsor(){
    if(!editSp||!k)return;setSaving(true)
    if(editSp.id){
      await supabase.from('sponsoren').update(editSp).eq('id',editSp.id)
      setSponsoren(prev=>prev.map(s=>s.id===editSp.id?{...s,...editSp}as Sponsor:s))
    }else{
      const{data}=await supabase.from('sponsoren').insert({...editSp,kongress_id:k.id}).select().single()
      if(data)setSponsoren(prev=>[...prev,data as Sponsor])
    }
    setEditSp(null);setSaving(false)
  }

  async function delSponsor(id:number){
    if(!confirm('Sponsor und alle Rechnungen löschen?'))return
    await supabase.from('sponsoren_rechnungen').delete().eq('sponsor_id',id)
    await supabase.from('sponsoren').delete().eq('id',id)
    setSponsoren(prev=>prev.filter(s=>s.id!==id))
    setRechnungen(prev=>prev.filter(r=>r.sponsor_id!==id))
  }

  async function delRechnung(r:SponsorRechnung){
    if(r.zahlungsstatus==='bezahlt'){alert('Bezahlte Rechnungen können nicht gelöscht werden. Bitte Stornorechnung erstellen.');return}
    if(!confirm('Rechnung wirklich löschen?'))return
    await supabase.from('sponsoren_rechnungen').delete().eq('id',r.id)
    setRechnungen(prev=>prev.filter(x=>x.id!==r.id))
  }

  function startR(sp:Sponsor,editR?:SponsorRechnung){
    const m=getMwstTyp(sp.land)
    const desc=k?`Sponsoring ${k.name} ${k.jahr}`:'Sponsoring'
    if(editR){
      setRForm({beschreibung:editR.beschreibung,betrag:editR.betrag_brutto??editR.betrag_netto,mwst_typ:editR.mwst_typ as MwstTyp})
    }else{
      setRForm({beschreibung:desc,betrag:0,mwst_typ:m})
    }
    setNewR({sponsor:sp,editRechnung:editR})
  }

  async function createPreview(){
    if(!newR||!k)return
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=newR.editRechnung?.rechnungsnummer??nextRechnungsnr(existing,k.jahr,true)
    setPreviewNr(nr)
    const sp=newR.sponsor
    const brutto=rForm.betrag
    const netto=rForm.mwst_typ==='mit_mwst'?brutto/1.2:brutto
    const html=buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:'Damen und Herren',
      empfaenger_name:sp.firmenname,
      empfaenger_zeile2:sp.ansprechperson??undefined,
      empfaenger_strasse:`${sp.strasse} ${sp.hausnummer??''}`,
      empfaenger_plz_ort:`${sp.plz} ${sp.ort}`,
      empfaenger_land:sp.land,
      empfaenger_kennung:sp.uid_nr?`UID: ${sp.uid_nr}`:undefined,
      positionen:[{bezeichnung:rForm.beschreibung,menge:1,einzelpreis:netto}],
      mwst_typ:rForm.mwst_typ,bezahlt:false,
      kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`vielen Dank für Ihre Bereitschaft und Ihr Interesse, den ${k.name} ${k.jahr} zu fördern.\n\nFür die vereinbarten Leistungen dürfen wir wunschgemäß nachstehende Rechnung stellen und höflich um Überweisung des gesamten Rechnungsbetrages auf das nachstehend angeführte Konto ersuchen.`,
    })
    setPreview(html)
  }

  async function saveR(){
    if(!preview||!newR||!k||!previewNr)return;setSaving(true)
    const sp=newR.sponsor
    const brutto=rForm.betrag
    const netto=rForm.mwst_typ==='mit_mwst'?brutto/1.2:brutto
    // In Storage speichern
    const dateiname=`${k.jahr}/S_${sp.firmenname.replace(/[^a-zA-Z0-9]/g,'_')}_${previewNr}.html`
    await supabase.storage.from('rechnungen').upload(dateiname,new Blob([preview],{type:'text/html'}),{upsert:true})
    if(newR.editRechnung){
      // Bestehende aktualisieren
      await supabase.from('sponsoren_rechnungen').update({beschreibung:rForm.beschreibung,betrag_netto:netto,betrag_brutto:brutto,mwst_typ:rForm.mwst_typ}).eq('id',newR.editRechnung.id)
    }else{
      // Neu erstellen
      await supabase.from('sponsoren_rechnungen').insert({sponsor_id:sp.id,rechnungsnummer:previewNr,betrag_netto:netto,betrag_brutto:brutto,mwst_typ:rForm.mwst_typ,beschreibung:rForm.beschreibung,zahlungsstatus:'ausstehend',kongress_id:k.id,erstellt_am:new Date().toISOString()})
    }
    await load(k.id)
    setPreview(null);setNewR(null);setSaving(false)
  }

  async function sendR(r:SponsorRechnung){
    const sp=sponsoren.find(s=>s.id===r.sponsor_id)
    if(!sp||!k)return;setSending(r.id)
    const brutto=r.betrag_brutto??r.betrag_netto
    const netto=r.mwst_typ==='mit_mwst'?brutto/1.2:brutto
    const html=buildRechnungHTML({
      rechnungsnummer:r.rechnungsnummer??'',datum:new Date(r.erstellt_am).toLocaleDateString('de-AT'),
      anrede:'Damen und Herren',empfaenger_name:sp.firmenname,
      empfaenger_strasse:`${sp.strasse} ${sp.hausnummer??''}`,
      empfaenger_plz_ort:`${sp.plz} ${sp.ort}`,empfaenger_land:sp.land,
      empfaenger_kennung:sp.uid_nr?`UID: ${sp.uid_nr}`:undefined,
      positionen:[{bezeichnung:r.beschreibung,menge:1,einzelpreis:netto}],
      mwst_typ:r.mwst_typ as MwstTyp,bezahlt:r.zahlungsstatus==='bezahlt',
      kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`vielen Dank für Ihre Bereitschaft und Ihr Interesse, den ${k.name} ${k.jahr} zu fördern.`,
    })
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:sp.email,vorname:'',nachname:sp.firmenname,rechnungsnummer:r.rechnungsnummer,html,kongress_name:k.name})})
    await supabase.from('sponsoren_rechnungen').update({versendet_am:new Date().toISOString()}).eq('id',r.id)
    await load(k.id);setSending(null)
  }

  async function setZahlungStatus(id:number,status:string){
    await supabase.from('sponsoren_rechnungen').update({zahlungsstatus:status,bezahlt_am:status==='bezahlt'?new Date().toISOString():null}).eq('id',id)
    setRechnungen(prev=>prev.map(r=>r.id===id?{...r,zahlungsstatus:status}:r))
  }

  async function createStornoPreview(r:SponsorRechnung){
    if(!k)return
    const sp=sponsoren.find(s=>s.id===r.sponsor_id)
    if(!sp)return
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=nextRechnungsnr(existing,k.jahr,true)+'S'
    const brutto=r.betrag_brutto??r.betrag_netto
    const netto=r.mwst_typ==='mit_mwst'?brutto/1.2:brutto
    const mwst=brutto-netto
    const html=`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Stornorechnung ${nr}</title>
    <style>@page{size:A4;margin:15mm 20mm 20mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm"><div></div><div style="text-align:right"><img src="/logo.svg" style="height:18mm;width:auto;display:block;margin-left:auto;margin-bottom:6px"/><div style="font-size:10px;line-height:1.8;color:#333"><div>${new Date().toLocaleDateString('de-AT')}</div><div>Bearbeiterin: Dr. iur. Mara Neumayr, MBL</div><div>E-Mail: info@sportmedizin-arlberg.at</div></div></div></div>
    <div style="margin-bottom:7mm;font-size:10px;line-height:1.8"><div style="font-weight:bold">${sp.firmenname}</div><div>${sp.strasse} ${sp.hausnummer??''}</div><div>${sp.plz} ${sp.ort}, ${sp.land}</div>${sp.uid_nr?`<div>UID: ${sp.uid_nr}</div>`:''}</div>
    <div style="margin-bottom:4mm"><div style="font-size:16px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div><div style="font-size:11px;font-weight:bold;margin-top:2px">zur Rechnung ${r.rechnungsnummer} — ${k.name} ${k.jahr}</div></div>
    <div style="margin-bottom:5mm;font-size:10px">Stornorechnung-Nr.: <strong>${nr}</strong></div>
    <div style="margin-bottom:5mm;font-size:10px;line-height:1.7"><p>Sehr geehrte Damen und Herren,</p><br><p>hiermit stornieren wir unsere Rechnung ${r.rechnungsnummer} und erstatten Ihnen folgenden Betrag:</p></div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm">
      <thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Beschreibung</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:15%">Betrag</th></tr></thead>
      <tbody><tr><td style="border:1px solid #ccc;padding:6px 10px">${r.beschreibung}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;color:#dc2626">−${brutto.toFixed(2)}</td></tr></tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:5mm">
      <table style="width:220px;border-collapse:collapse">
        ${r.mwst_typ==='mit_mwst'?`<tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Bruttobetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${brutto.toFixed(2)}</td></tr><tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ust. 20% inkl.</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${mwst.toFixed(2)}</td></tr>`:''}
        <tr><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">Rückerstattungsbetrag</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">−${brutto.toFixed(2)}</td></tr>
      </table>
    </div>
    <p style="font-size:10px;color:#555;margin-bottom:8mm">Der Rückerstattungsbetrag von EUR ${brutto.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>
    <div style="font-size:10px;line-height:1.9;margin-top:8mm"><p>Mit sportlichen Grüßen</p><br><br><p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p><p>Kongresspräsident</p></div>
    <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:9px;color:#555;position:fixed;bottom:10mm;left:20mm;right:20mm"><div><div style="font-weight:bold;margin-bottom:3px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz</div><div>UID: ATU 61957546</div></div><div><div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div><div>IBAN: AT67 1912 0500 9922 3610</div><div>BIC: SPBAATWW · Bank99</div></div><div><div style="font-weight:bold;margin-bottom:3px">Kontakt</div><div>Tel.: 04852 61952-52</div><div>info@sportmedizin-arlberg.at</div></div></div>
    </body></html>`
    setStornoNr(nr);setStornoPreview(html);setStornoTarget(r)
  }

  async function saveStorno(){
    if(!stornoTarget||!k||!stornoPreview||!stornoNr)return;setSaving(true)
    const sp=sponsoren.find(s=>s.id===stornoTarget.sponsor_id)
    if(!sp){setSaving(false);return}
    const win=window.open('','_blank');if(win){win.document.write(stornoPreview);win.document.close();setTimeout(()=>win.print(),600)}
    const dateiname=`${k.jahr}/S_${sp.firmenname.replace(/[^a-zA-Z0-9]/g,'_')}_${stornoNr}.html`
    await supabase.storage.from('rechnungen').upload(dateiname,new Blob([stornoPreview],{type:'text/html'}),{upsert:true})
    const brutto=stornoTarget.betrag_brutto??stornoTarget.betrag_netto
    const netto=stornoTarget.mwst_typ==='mit_mwst'?brutto/1.2:brutto
    await supabase.from('sponsoren_rechnungen').insert({sponsor_id:stornoTarget.sponsor_id,rechnungsnummer:stornoNr,betrag_netto:-netto,betrag_brutto:-brutto,mwst_typ:stornoTarget.mwst_typ,beschreibung:`STORNO zu ${stornoTarget.rechnungsnummer}`,zahlungsstatus:'storno',kongress_id:k.id,erstellt_am:new Date().toISOString()})
    setStornoPreview(null);setStornoTarget(null)
    await load(k.id);setSaving(false)
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
                  <td className="px-4 py-3"><div className="flex gap-1.5">
                    <Btn size="sm" onClick={()=>startR(s)}>+ Rechnung</Btn>
                    <Btn size="sm" variant="outline" onClick={()=>setEditSp({...s})}>Bearbeiten</Btn>
                    <Btn size="sm" variant="danger" onClick={()=>delSponsor(s.id)}>Löschen</Btn>
                  </div></td>
                </tr>
              ))}
            </Table>
          </div>

          {/* RECHNUNGEN */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">Sponsoren-Rechnungen ({rechnungen.filter(r=>r.zahlungsstatus!=='storno').length})</h2></div>
            <Table headers={['Nr.','Firma','Beschreibung','Brutto','MwSt-Typ','Status','Versendet','']} empty={rechnungen.length===0}>
              {rechnungen.map(r=>{
                const sp=sponsoren.find(s=>s.id===r.sponsor_id)
                const isStorno=r.zahlungsstatus==='storno'
                const versendet=(r as any).versendet_am
                return(
                  <tr key={r.id} className={`hover:bg-gray-50 ${isStorno?'opacity-50':''}`}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{r.rechnungsnummer??'—'}</td>
                    <td className="px-4 py-3 font-medium text-sm">{sp?.firmenname??'—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{r.beschreibung}</td>
                    <td className="px-4 py-3 font-bold text-sm">{isStorno?<span className="text-red-600">−</span>:''}€ {Math.abs(r.betrag_brutto??r.betrag_netto).toFixed(2)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{MWST_LABEL[r.mwst_typ]??r.mwst_typ}</td>
                    <td className="px-4 py-3">
                      {isStorno?<Badge label="Storno" variant="red"/>:r.zahlungsstatus==='bezahlt'?<Badge label="Bezahlt" variant="green"/>:<Badge label="Ausstehend" variant="yellow"/>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">{versendet?new Date(versendet).toLocaleDateString('de-AT'):'—'}</td>
                    <td className="px-4 py-3"><div className="flex gap-1.5 flex-wrap">
                      {!isStorno&&r.zahlungsstatus!=='bezahlt'&&!versendet&&(
                        <Btn size="sm" variant="outline" onClick={()=>startR(sp!,r)}>Bearbeiten</Btn>
                      )}
                      {!isStorno&&r.zahlungsstatus!=='bezahlt'&&(
                        <>
                          {versendet
                            ?<span className="text-[10px] text-gray-400 italic">Bereits versendet</span>
                            :<Btn size="sm" variant="outline" disabled={sending===r.id} onClick={()=>sendR(r)}>{sending===r.id?'Sendet…':'📧 Senden'}</Btn>
                          }
                        </>
                      )}
                      {!isStorno&&r.zahlungsstatus!=='bezahlt'&&<Btn size="sm" onClick={()=>setZahlungStatus(r.id,'bezahlt')}>✓ Bezahlt</Btn>}
                      {!isStorno&&r.zahlungsstatus==='bezahlt'&&<Btn size="sm" variant="outline" onClick={()=>setZahlungStatus(r.id,'ausstehend')}>Zurücksetzen</Btn>}
                      {!isStorno&&(r.zahlungsstatus==='bezahlt'||versendet)&&<Btn size="sm" variant="danger" onClick={()=>createStornoPreview(r)}>Storno</Btn>}
                      {!isStorno&&!versendet&&r.zahlungsstatus!=='bezahlt'&&<Btn size="sm" variant="danger" onClick={()=>delRechnung(r)}>Löschen</Btn>}
                    </div></td>
                  </tr>
                )
              })}
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
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Beschreibung (erscheint auf Rechnung) *</label>
              <input value={rForm.beschreibung} onChange={e=>setRForm({...rForm,beschreibung:e.target.value})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/>
              <p className="text-[10px] text-gray-400 mt-1">Automatisch mit Kongressname befüllt — kann angepasst werden</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Betrag brutto (€) *</label>
              <input type="number" value={rForm.betrag||''} onChange={e=>setRForm({...rForm,betrag:parseFloat(e.target.value)||0})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">MwSt.-Typ</label>
              <select value={rForm.mwst_typ} onChange={e=>setRForm({...rForm,mwst_typ:e.target.value as MwstTyp})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]">
                <option value="mit_mwst">Österreich (Brutto inkl. 20% MwSt.)</option>
                <option value="reverse_charge">EU – Reverse Charge</option>
                <option value="nicht_steuerbar">Nicht-EU – nicht steuerbar</option>
              </select>
            </div>
          </div>
          {rForm.mwst_typ==='mit_mwst'&&rForm.betrag>0&&(
            <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1 mb-3">
              <div className="flex justify-between"><span>Brutto (eingegeben)</span><span>€ {rForm.betrag.toFixed(2)}</span></div>
              <div className="flex justify-between text-gray-500"><span>enthaltene MwSt. 20%</span><span>€ {(rForm.betrag-(rForm.betrag/1.2)).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Netto</span><span>€ {(rForm.betrag/1.2).toFixed(2)}</span></div>
            </div>
          )}
          {rForm.mwst_typ==='reverse_charge'&&!newR.sponsor.uid_nr&&(
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-3">⚠ UID-Nr. des Sponsors fehlt!</div>
          )}
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setNewR(null)}>Abbrechen</Btn>
            <Btn onClick={createPreview} disabled={!rForm.beschreibung||rForm.betrag<=0||(rForm.mwst_typ==='reverse_charge'&&!newR.sponsor.uid_nr)}>Vorschau →</Btn>
          </div>
        </Modal>
      )}

      {/* VORSCHAU — nur Speichern, kein Senden */}
      {preview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="font-bold">Vorschau — {previewNr}</h2><p className="text-xs text-gray-400">Bitte überprüfen — nach dem Speichern kann die Rechnung versendet werden</p></div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>setPreview(null)}>← Zurück</Btn>
                <Btn onClick={saveR} disabled={saving}>{saving?'Speichert…':'✓ Speichern'}</Btn>
              </div>
            </div>
            <iframe srcDoc={preview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}

      {/* STORNORECHNUNG VORSCHAU */}
      {stornoPreview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50">
              <div><h2 className="font-bold text-red-700">Stornorechnung — {stornoNr}</h2><p className="text-xs text-red-400">Gutschrift zur Original-Rechnung</p></div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setStornoPreview(null);setStornoTarget(null)}}>← Zurück</Btn>
                <Btn onClick={saveStorno} disabled={saving}>{saving?'Speichert…':'✓ Speichern & Drucken'}</Btn>
              </div>
            </div>
            <iframe srcDoc={stornoPreview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

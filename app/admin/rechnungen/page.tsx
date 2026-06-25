'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,type Kongress}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Row={id:number;teilnehmer_id:number;gebucht_am:string;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;teilnehmer:{id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean};kurse:{titel:string}}
type TGroup={tnId:number;tn:Row['teilnehmer'];buchungen:Row[];rNr:string|null;versendet:string|null;allBezahlt:boolean;pdfPath:string|null}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[rows,setRows]=useState<Row[]>([])
  const[loading,setLoading]=useState(true)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[previewHtml,setPreviewHtml]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[creating,setCreating]=useState<TGroup|null>(null)
  const[anrede,setAnrede]=useState<'Damen und Herren'|'Frau'|'Herr'>('Damen und Herren')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<number|null>(null)
  const[stornoTarget,setStornoTarget]=useState<TGroup|null>(null)
  const[stornoPreview,setStornoPreview]=useState<string|null>(null)
  const[stornoNr,setStornoNr]=useState('')

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return};setK(k)
    await loadRows(k.id);setLoading(false)
  })},[])

  async function loadRows(kongressId:number){
    const{data}=await supabase.from('buchungen')
      .select('id,teilnehmer_id,gebucht_am,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel)')
      .eq('kongress_id',kongressId).order('gebucht_am',{ascending:false})
    setRows((data as unknown as Row[])??[])
  }

  const groups:TGroup[]=Object.values(
    rows.reduce((acc,r)=>{
      if(!acc[r.teilnehmer_id])acc[r.teilnehmer_id]={tnId:r.teilnehmer_id,tn:r.teilnehmer,buchungen:[],rNr:null,versendet:null,allBezahlt:false,pdfPath:null}
      acc[r.teilnehmer_id].buchungen.push(r)
      if(r.rechnungsnummer)acc[r.teilnehmer_id].rNr=r.rechnungsnummer
      if(r.rechnung_versendet_am)acc[r.teilnehmer_id].versendet=r.rechnung_versendet_am
      return acc
    },{} as Record<number,TGroup>)
  ).map(g=>({...g,allBezahlt:g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')}))
  .sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname))

  function buildHtml(g:TGroup, nr:string, anredeText:string):string{
    if(!k)return''
    const aktiv=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    return buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:anredeText,
      empfaenger_name:`${g.tn.vorname} ${g.tn.nachname}`,
      empfaenger_strasse:`${g.tn.strasse} ${g.tn.hausnummer}`,
      empfaenger_plz_ort:`${g.tn.postleitzahl} ${g.tn.stadt}`,
      empfaenger_land:g.tn.land,
      empfaenger_kennung:`ÖÄK Nr.: ${g.tn.oeak_nr}`,
      positionen:aktiv.map(b=>({bezeichnung:b.kurse.titel,menge:1,einzelpreis:b.gebuchter_preis})),
      mwst_typ:'mit_mwst',bezahlt:g.allBezahlt,
      kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`Vielen Dank für Ihr Interesse am Sportmedizin Kongress St. Christoph am Arlberg ${k.jahr}. Für die Teilnahme an den u.a. Kursen dürfen wir folgende Rechnung stellen:`,
    })
  }

  function buildStornoHtml(g:TGroup, stornoNr:string, origNr:string):string{
    if(!k)return''
    const stornierte=g.buchungen.filter(b=>b.zahlungsstatus==='storniert')
    const brutto=stornierte.reduce((s,b)=>s+b.gebuchter_preis,0)
    const netto=brutto/1.2
    const mwst=brutto-netto
    const posTR=stornierte.map((b,i)=>`
      <tr>
        <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${i+1}.</td>
        <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${b.kurse.titel}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:10px">1</td>
        <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">Stück</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px;color:#dc2626">−${b.gebuchter_preis.toFixed(2)}</td>
        <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px;color:#dc2626">−${b.gebuchter_preis.toFixed(2)}</td>
      </tr>`).join('')
    return`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Stornorechnung ${stornoNr}</title>
    <style>@page{size:A4;margin:15mm 20mm 20mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm">
      <div></div>
      <div style="text-align:right">
        <img src="/logo.svg" style="height:18mm;width:auto;display:block;margin-left:auto;margin-bottom:6px"/>
        <div style="font-size:10px;line-height:1.8;color:#333">
          <div>${new Date().toLocaleDateString('de-AT')}</div>
          <div>Bearbeiterin: Dr. iur. Mara Neumayr, MBL</div>
          <div>E-Mail: info@sportmedizin-arlberg.at</div>
        </div>
      </div>
    </div>
    <div style="margin-bottom:7mm;font-size:10px;line-height:1.8">
      <div style="font-weight:bold">${g.tn.vorname} ${g.tn.nachname}</div>
      <div>${g.tn.strasse} ${g.tn.hausnummer}</div>
      <div>${g.tn.postleitzahl} ${g.tn.stadt}</div>
      <div style="color:#555;margin-top:2px">ÖÄK Nr.: ${g.tn.oeak_nr}</div>
    </div>
    <div style="margin-bottom:4mm">
      <div style="font-size:16px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div>
      <div style="font-size:11px;font-weight:bold;margin-top:2px">zur Rechnung ${origNr} — ${k.name} ${k.jahr}</div>
    </div>
    <div style="margin-bottom:5mm;font-size:10px;color:#333">
      Stornorechnung-Nr.: <strong>${stornoNr}</strong>
    </div>
    <div style="margin-bottom:5mm;font-size:10px;line-height:1.7">
      <p>Sehr geehrte Damen und Herren,</p><br>
      <p>hiermit stornieren wir unsere Rechnung ${origNr} teilweise und erstatten Ihnen folgende Beträge:</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm">
      <thead><tr style="background:#f0f0f0">
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th>
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th>
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:center;width:8%">Menge</th>
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:8%">Einheit</th>
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Einzelpreis</th>
        <th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Gesamtpreis</th>
      </tr></thead>
      <tbody>${posTR}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:5mm">
      <table style="width:220px;border-collapse:collapse">
        <tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Bruttobetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${brutto.toFixed(2)}</td></tr>
        <tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ust. 20% inkl.</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${mwst.toFixed(2)}</td></tr>
        <tr><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">Rückerstattungsbetrag</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">−${brutto.toFixed(2)}</td></tr>
      </table>
    </div>
    <p style="font-size:10px;color:#555;margin-bottom:8mm">Der Rückerstattungsbetrag von EUR ${brutto.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>
    <div style="font-size:10px;line-height:1.9;margin-top:8mm">
      <p>Mit sportlichen Grüßen</p><br><br>
      <p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p>
      <p>Kongresspräsident</p>
    </div>
    <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:9px;color:#555;position:fixed;bottom:10mm;left:20mm;right:20mm">
      <div><div style="font-weight:bold;margin-bottom:3px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz</div><div>UID: ATU 61957546</div></div>
      <div><div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div><div>IBAN: AT67 1912 0500 9922 3610</div><div>BIC: SPBAATWW · Bank99</div></div>
      <div><div style="font-weight:bold;margin-bottom:3px">Kontakt</div><div>Tel.: 04852 61952-52</div><div>info@sportmedizin-arlberg.at</div></div>
    </div>
    </body></html>`
  }

  async function openExistingPreview(g:TGroup){
    if(!g.rNr||!k)return
    // Versuche aus Storage zu laden
    const tn=g.tn
    const dateiname=`${k.jahr}/${tn.nachname}_${tn.vorname}_${g.rNr}.html`
    const{data}=await supabase.storage.from('rechnungen').download(dateiname)
    if(data){
      const text=await data.text()
      setPreviewHtml(text);setPreviewNr(g.rNr)
    } else {
      // Neu generieren
      const anredeText='Damen und Herren'
      const html=buildHtml(g,g.rNr,anredeText)
      setPreviewHtml(html);setPreviewNr(g.rNr)
    }
  }

  async function createPreview(g:TGroup){
    if(!k)return
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=nextRechnungsnr(existing,k.jahr)
    const anredeText=anrede==='Damen und Herren'?'Damen und Herren':`${anrede} ${g.tn.nachname}`
    setPreviewNr(nr)
    setPreviewHtml(buildHtml(g,nr,anredeText))
    setCreating(g)
  }

  async function saveAndPrint(){
    if(!creating||!k||!previewNr||!previewHtml)return
    setSaving(true)
    const win=window.open('','_blank')
    if(win){win.document.write(previewHtml);win.document.close();setTimeout(()=>win.print(),600)}
    const tn=creating.tn
    const dateiname=`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`
    const blob=new Blob([previewHtml],{type:'text/html'})
    await supabase.storage.from('rechnungen').upload(dateiname,blob,{upsert:true})
    for(const b of creating.buchungen){
      await supabase.from('buchungen').update({rechnungsnummer:previewNr}).eq('id',b.id)
    }
    const aktiv=creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const brutto=aktiv.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({
      kongress_id:k.id,teilnehmer_id:creating.tnId,rechnungsnummer:previewNr,
      typ:'teilnehmer',anrede,gesamtbetrag_brutto:brutto,netto:brutto/1.2,
      mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,
      bezahlt:creating.allBezahlt,erstellt_am:new Date().toISOString(),
    })
    await loadRows(k.id)
    setPreviewHtml(null);setCreating(null);setSaving(false)
  }

  async function send(g:TGroup){
    if(!g.rNr||!k)return
    setSending(g.tnId)
    const html=buildHtml(g,g.rNr,'Damen und Herren')
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,rechnungsnummer:g.rNr,html,kongress_name:k.name})})
    for(const b of g.buchungen){await supabase.from('buchungen').update({rechnung_versendet_am:new Date().toISOString()}).eq('id',b.id)}
    await loadRows(k.id)
    setSending(null)
  }

  async function createStornoPreview(g:TGroup){
    if(!g.rNr||!k)return
    const stornierte=g.buchungen.filter(b=>b.zahlungsstatus==='storniert')
    if(!stornierte.length){alert('Keine stornierten Buchungen gefunden.');return}
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=nextRechnungsnr(existing,k.jahr)+'S'
    setStornoNr(nr)
    setStornoPreview(buildStornoHtml(g,nr,g.rNr))
    setStornoTarget(g)
  }

  async function saveStorno(){
    if(!stornoTarget||!k||!stornoPreview||!stornoNr)return
    setSaving(true)
    const win=window.open('','_blank')
    if(win){win.document.write(stornoPreview);win.document.close();setTimeout(()=>win.print(),600)}
    const tn=stornoTarget.tn
    const dateiname=`${k.jahr}/${tn.nachname}_${tn.vorname}_${stornoNr}.html`
    const blob=new Blob([stornoPreview],{type:'text/html'})
    await supabase.storage.from('rechnungen').upload(dateiname,blob,{upsert:true})
    const stornierte=stornoTarget.buchungen.filter(b=>b.zahlungsstatus==='storniert')
    const brutto=stornierte.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({
      kongress_id:k.id,teilnehmer_id:stornoTarget.tnId,rechnungsnummer:stornoNr,
      typ:'storno',anrede:'Damen und Herren',gesamtbetrag_brutto:-brutto,
      netto:-brutto/1.2,mwst_betrag:-(brutto-(brutto/1.2)),mwst_prozent:20,
      bezahlt:false,erstellt_am:new Date().toISOString(),
    })
    setStornoPreview(null);setStornoTarget(null)
    await loadRows(k.id)
    setSaving(false)
  }

  async function sendStorno(g:TGroup){
    if(!stornoNr||!k||!stornoPreview)return
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,rechnungsnummer:stornoNr,html:stornoPreview,kongress_name:k.name})})
  }

  return(
    <div>
      <PageHeader title="Rechnungen" sub="Teilnehmer-Rechnungen"/>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {groups.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Noch keine Buchungen</div>}
            {groups.map((g,i)=>{
              const isOpen=expanded===g.tnId
              const total=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0)
              const hatStorno=g.buchungen.some(b=>b.zahlungsstatus==='storniert')
              return(
                <div key={g.tnId} className={i>0?'border-t border-gray-100':''}>
                  {/* HAUPTZEILE */}
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>
                      {isOpen?'−':'+'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{g.tn.nachname} {g.tn.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.tn.email}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {g.rNr&&<span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{g.rNr}</span>}
                      <Badge label={g.allBezahlt?'Bezahlt':'Ausstehend'} variant={g.allBezahlt?'green':'yellow'}/>
                      {hatStorno&&<Badge label="Storno" variant="red"/>}
                      <span className="text-sm font-bold text-gray-700">€ {total.toFixed(2)}</span>
                      {g.versendet&&<span className="text-[10px] text-gray-400">📧 {new Date(g.versendet).toLocaleDateString('de-AT')}</span>}
                    </div>
                  </div>

                  {/* AUFGEKLAPPT */}
                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4">
                      {/* Gebuchte Kurse */}
                      <div className="mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Gebuchte Kurse</p>
                        <div className="space-y-1.5">
                          {g.buchungen.map(b=>(
                            <div key={b.id} className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm ${b.zahlungsstatus==='storniert'?'bg-red-50 text-red-600 line-through':b.zahlungsstatus==='bezahlt'?'bg-green-50':'bg-white border border-gray-100'}`}>
                              <span className="font-medium">{b.kurse.titel}</span>
                              <div className="flex items-center gap-3">
                                <Badge label={b.zahlungsstatus==='bezahlt'?'Bezahlt':b.zahlungsstatus==='storniert'?'Storniert':'Ausstehend'} variant={b.zahlungsstatus==='bezahlt'?'green':b.zahlungsstatus==='storniert'?'red':'yellow'}/>
                                <span className="font-bold text-xs">€ {b.gebuchter_preis.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AKTIONEN */}
                      <div className="flex gap-2 flex-wrap">
                        {!g.rNr&&(
                          <Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating(g)}}>📄 Rechnung erstellen</Btn>
                        )}
                        {g.rNr&&(
                          <>
                            <Btn size="sm" variant="outline" onClick={()=>openExistingPreview(g)}>👁 Rechnung anzeigen</Btn>
                            <Btn size="sm" variant="outline" onClick={()=>{setAnrede('Damen und Herren');setCreating(g)}}>🔄 Neu erstellen</Btn>
                            <Btn size="sm" variant="outline" disabled={sending===g.tnId} onClick={()=>send(g)}>{sending===g.tnId?'Sendet…':'📧 Senden'}</Btn>
                            {hatStorno&&(
                              <Btn size="sm" variant="danger" onClick={()=>createStornoPreview(g)}>🔴 Stornorechnung erstellen</Btn>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* RECHNUNG ERSTELLEN MODAL */}
      {creating&&!previewHtml&&(
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="font-bold text-base mb-1">Rechnung erstellen</h2>
            <p className="text-sm text-gray-500 mb-4">{creating.tn.nachname} {creating.tn.vorname}</p>
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">Anrede</p>
              <div className="flex gap-2 flex-wrap">
                {(['Damen und Herren','Frau','Herr'] as const).map(a=>(
                  <button key={a} onClick={()=>setAnrede(a)} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {a==='Damen und Herren'?'Damen und Herren':`${a}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>(
                <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-200 last:border-0">
                  <span className="text-gray-700">{b.kurse.titel}</span>
                  <span className="font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold mt-2 pt-2 border-t">
                <span>Gesamt (inkl. 20% MwSt.)</span>
                <span>€ {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Btn variant="outline" onClick={()=>setCreating(null)}>Abbrechen</Btn>
              <Btn onClick={()=>createPreview(creating)}>Vorschau →</Btn>
            </div>
          </div>
        </div>
      )}

      {/* RECHNUNG VORSCHAU */}
      {previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="font-bold text-base">Rechnung — {previewNr}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{creating?'Neu erstellt — bitte überprüfen':'Gespeicherte Rechnung'}</p></div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreviewHtml(null);if(!creating)setExpanded(expanded)}}>← Schließen</Btn>
                {creating&&<Btn onClick={saveAndPrint} disabled={saving}>{saving?'Wird gespeichert…':'✓ Speichern & Drucken'}</Btn>}
                {!creating&&<Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(previewHtml);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>}
              </div>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}

      {/* STORNORECHNUNG VORSCHAU */}
      {stornoPreview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50">
              <div><h2 className="font-bold text-base text-red-700">Stornorechnung — {stornoNr}</h2>
              <p className="text-xs text-red-400 mt-0.5">Gutschrift zur Original-Rechnung — bitte überprüfen</p></div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setStornoPreview(null);setStornoTarget(null)}}>← Zurück</Btn>
                {stornoTarget&&<Btn variant="outline" onClick={()=>sendStorno(stornoTarget)}>📧 Per E-Mail senden</Btn>}
                <Btn onClick={saveStorno} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">{saving?'Speichert…':'✓ Speichern & Drucken'}</Btn>
              </div>
            </div>
            <iframe srcDoc={stornoPreview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

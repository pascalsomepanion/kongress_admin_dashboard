'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,type Kongress}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;gebucht_am:string;teilnehmer_id:number;kurse:{titel:string}}
type TN={id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean}
type TGroup={tnId:number;tn:TN;buchungen:Buchung[]}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[groups,setGroups]=useState<TGroup[]>([])
  const[loading,setLoading]=useState(true)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[previewHtml,setPreviewHtml]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[previewMode,setPreviewMode]=useState<'new'|'existing'|'storno'>('new')
  const[creating,setCreating]=useState<{group:TGroup;buchungen:Buchung[]}|null>(null)
  const[anrede,setAnrede]=useState<'Damen und Herren'|'Frau'|'Herr'>('Damen und Herren')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<string|null>(null)
  const[stornoGroup,setStornoGroup]=useState<TGroup|null>(null)
  const[stornoBuchungen,setStornoBuchungen]=useState<Buchung[]>([])
  const[stornoNr,setStornoNr]=useState('')

  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);await load(k.id);setLoading(false)})},[])

  async function load(kid:number){
    const{data:b}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel)').eq('kongress_id',kid).order('gebucht_am',{ascending:false})
    const map:Record<number,TGroup>={}
    ;(b??[]).forEach((x:any)=>{
      const tid=x.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,tn:x.teilnehmer,buchungen:[]}
      map[tid].buchungen.push({id:x.id,kurs_id:x.kurs_id,gebuchter_preis:x.gebuchter_preis,zahlungsstatus:x.zahlungsstatus,rechnungsnummer:x.rechnungsnummer,rechnung_versendet_am:x.rechnung_versendet_am,gebucht_am:x.gebucht_am,teilnehmer_id:tid,kurse:x.kurse})
    })
    setGroups(Object.values(map).sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname)))
  }

  // Rechnungshistorie: gruppiert nach Rechnungsnummer + Stornos
  function getHistorie(buchungen:Buchung[]):{rNr:string|null;buchungen:Buchung[];allBezahlt:boolean;hasOffen:boolean;hatBezahlteUndStorniert:boolean}[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{const k=b.rechnungsnummer??'__ohne__';if(!map[k])map[k]=[];map[k].push(b)})
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne__'?null:key,buchungen:bs,
      allBezahlt:bs.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert'),
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
      hatBezahlteUndStorniert:bs.some(b=>b.zahlungsstatus==='bezahlt')&&bs.some(b=>b.zahlungsstatus==='storniert'),
    }))
  }

  function buildHtml(g:TGroup,nr:string,buchungen:Buchung[],anredeText:string,bezahlt:boolean):string{
    if(!k)return''
    return buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:anredeText,empfaenger_name:`${g.tn.vorname} ${g.tn.nachname}`,
      empfaenger_strasse:`${g.tn.strasse} ${g.tn.hausnummer}`,
      empfaenger_plz_ort:`${g.tn.postleitzahl} ${g.tn.stadt}`,
      empfaenger_land:g.tn.land,empfaenger_kennung:`ÖÄK Nr.: ${g.tn.oeak_nr}`,
      positionen:buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>({bezeichnung:b.kurse.titel,menge:1,einzelpreis:b.gebuchter_preis})),
      mwst_typ:'mit_mwst',bezahlt,kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`Vielen Dank für Ihr Interesse am Sportmedizin Kongress ${k.jahr}. Für die Teilnahme an den u.a. Kursen dürfen wir folgende Rechnung stellen:`,
    })
  }

  function buildStornoHtml(g:TGroup,stornoNr:string,origNr:string,stornierte:Buchung[]):string{
    if(!k)return''
    const brutto=stornierte.reduce((s,b)=>s+b.gebuchter_preis,0)
    const netto=brutto/1.2;const mwst=brutto-netto
    const posTR=stornierte.map((b,i)=>`<tr><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${i+1}.</td><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${b.kurse.titel}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:10px">1</td><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">Stück</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px;color:#dc2626">−${b.gebuchter_preis.toFixed(2)}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px;color:#dc2626">−${b.gebuchter_preis.toFixed(2)}</td></tr>`).join('')
    return`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Stornorechnung ${stornoNr}</title><style>@page{size:A4;margin:15mm 20mm 20mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm"><div></div><div style="text-align:right"><img src="/logo.svg" style="height:18mm;width:auto;display:block;margin-left:auto;margin-bottom:6px"/><div style="font-size:10px;line-height:1.8;color:#333"><div>${new Date().toLocaleDateString('de-AT')}</div><div>Bearbeiterin: Dr. iur. Mara Neumayr, MBL</div><div>E-Mail: info@sportmedizin-arlberg.at</div></div></div></div>
    <div style="margin-bottom:7mm;font-size:10px;line-height:1.8"><div style="font-weight:bold">${g.tn.vorname} ${g.tn.nachname}</div><div>${g.tn.strasse} ${g.tn.hausnummer}</div><div>${g.tn.postleitzahl} ${g.tn.stadt}</div><div style="color:#555;margin-top:2px">ÖÄK Nr.: ${g.tn.oeak_nr}</div></div>
    <div style="margin-bottom:4mm"><div style="font-size:16px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div><div style="font-size:11px;font-weight:bold;margin-top:2px">zur Rechnung ${origNr} — ${k.name} ${k.jahr}</div></div>
    <div style="margin-bottom:5mm;font-size:10px">Stornorechnung-Nr.: <strong>${stornoNr}</strong></div>
    <div style="margin-bottom:5mm;font-size:10px;line-height:1.7"><p>Sehr geehrte Damen und Herren,</p><br><p>hiermit stornieren wir unsere Rechnung ${origNr} teilweise und erstatten Ihnen folgende Beträge:</p></div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm"><thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:center;width:8%">Menge</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:8%">Einheit</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Einzelpreis</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Gesamtpreis</th></tr></thead><tbody>${posTR}</tbody></table>
    <div style="display:flex;justify-content:flex-end;margin-bottom:5mm"><table style="width:220px;border-collapse:collapse"><tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Bruttobetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${brutto.toFixed(2)}</td></tr><tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ust. 20% inkl.</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">−${mwst.toFixed(2)}</td></tr><tr><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">Rückerstattungsbetrag</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0 4px;border-top:2px solid #dc2626;color:#dc2626">−${brutto.toFixed(2)}</td></tr></table></div>
    <p style="font-size:10px;color:#555;margin-bottom:8mm">Der Rückerstattungsbetrag von EUR ${brutto.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>
    <div style="font-size:10px;line-height:1.9;margin-top:8mm"><p>Mit sportlichen Grüßen</p><br><br><p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p><p>Kongresspräsident</p></div>
    <div style="margin-top:auto;padding-top:5mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:9px;color:#555;position:fixed;bottom:10mm;left:20mm;right:20mm"><div><div style="font-weight:bold;margin-bottom:3px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz</div><div>UID: ATU 61957546</div></div><div><div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div><div>IBAN: AT67 1912 0500 9922 3610</div><div>BIC: SPBAATWW · Bank99</div></div><div><div style="font-weight:bold;margin-bottom:3px">Kontakt</div><div>Tel.: 04852 61952-52</div><div>info@sportmedizin-arlberg.at</div></div></div>
    </body></html>`
  }

  async function storniereBuchung(g:TGroup, b:Buchung){
    if(!k)return
    const bezahlt=b.zahlungsstatus==='bezahlt'
    if(!confirm(`"${b.kurse.titel}" stornieren?${bezahlt?' Da bereits bezahlt wird eine Stornorechnung erstellt.':''}`))return
    await supabase.from('buchungen').update({zahlungsstatus:'storniert'}).eq('id',b.id)
    if(bezahlt){
      // Stornorechnung vorbereiten
      const existing=await getAlleRechnungsnummern(k.id)
      const nr=nextRechnungsnr(existing,k.jahr)+'S'
      setStornoNr(nr)
      setStornoBuchungen([b])
      setStornoGroup(g)
      setPreviewHtml(buildStornoHtml(g,nr,b.rechnungsnummer??'',[ b]))
      setPreviewNr(nr)
      setPreviewMode('storno')
    }
    await load(k.id)
  }

  async function saveRechnung(){
    if(!creating||!k||!previewNr||!previewHtml)return
    setSaving(true)
    const win=window.open('','_blank')
    if(win){win.document.write(previewHtml);win.document.close();setTimeout(()=>win.print(),600)}
    const tn=creating.group.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    for(const b of creating.buchungen){await supabase.from('buchungen').update({rechnungsnummer:previewNr}).eq('id',b.id)}
    const aktiv=creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const brutto=aktiv.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:creating.group.tnId,rechnungsnummer:previewNr,typ:'teilnehmer',anrede,gesamtbetrag_brutto:brutto,netto:brutto/1.2,mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,bezahlt:aktiv.every(b=>b.zahlungsstatus==='bezahlt'),erstellt_am:new Date().toISOString()})
    setPreviewHtml(null);setCreating(null)
    await load(k.id);setSaving(false)
  }

  async function saveStorno(){
    if(!stornoGroup||!k||!previewHtml||!previewNr)return
    setSaving(true)
    const win=window.open('','_blank')
    if(win){win.document.write(previewHtml);win.document.close();setTimeout(()=>win.print(),600)}
    const tn=stornoGroup.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    const brutto=stornoBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:stornoGroup.tnId,rechnungsnummer:previewNr,typ:'storno',anrede:'Damen und Herren',gesamtbetrag_brutto:-brutto,netto:-brutto/1.2,mwst_betrag:-(brutto-(brutto/1.2)),mwst_prozent:20,bezahlt:false,erstellt_am:new Date().toISOString()})
    setPreviewHtml(null);setStornoGroup(null);setStornoBuchungen([])
    await load(k.id);setSaving(false)
  }

  async function sendEmail(g:TGroup, nr:string, html:string){
    if(!k)return
    setSending(nr)
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,rechnungsnummer:nr,html,kongress_name:k.name})})
    for(const b of g.buchungen.filter(b=>b.rechnungsnummer===nr)){await supabase.from('buchungen').update({rechnung_versendet_am:new Date().toISOString()}).eq('id',b.id)}
    await load(k.id);setSending(null)
  }

  async function loadPdf(g:TGroup, nr:string){
    if(!k)return
    const tn=g.tn
    const{data}=await supabase.storage.from('rechnungen').download(`${k.jahr}/${tn.nachname}_${tn.vorname}_${nr}.html`)
    if(data){const text=await data.text();setPreviewHtml(text);setPreviewNr(nr);setPreviewMode('existing')}
    else{
      // Neu generieren
      const buchungen=g.buchungen.filter(b=>b.rechnungsnummer===nr)
      const bezahlt=buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')
      setPreviewHtml(buildHtml(g,nr,buchungen,'Damen und Herren',bezahlt));setPreviewNr(nr);setPreviewMode('existing')
    }
  }

  return(
    <div>
      <PageHeader title="Rechnungen" sub="Teilnehmer-Rechnungen & Stornos"/>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {groups.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Noch keine Buchungen</div>}
            {groups.map((g,i)=>{
              const isOpen=expanded===g.tnId
              const historie=getHistorie(g.buchungen)
              const hatOffeneOhneRechnung=g.buchungen.some(b=>!b.rechnungsnummer&&b.zahlungsstatus!=='storniert')
              const alleRechNummern=Array.from(new Set(g.buchungen.map(b=>b.rechnungsnummer).filter(Boolean)))
              const hatStorno=g.buchungen.some(b=>b.zahlungsstatus==='storniert')
              return(
                <div key={g.tnId} className={i>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{g.tn.nachname} {g.tn.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.tn.email}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {alleRechNummern.map(nr=><span key={nr} className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{nr}</span>)}
                      {hatOffeneOhneRechnung&&<Badge label="Ohne Rechnung" variant="yellow"/>}
                      {hatStorno&&<Badge label="Storno" variant="red"/>}
                    </div>
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4 space-y-5">
                      {/* RECHNUNGSHISTORIE */}
                      {historie.map((h,hi)=>{
                        const aktivBuchungen=h.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
                        const stornierteBuchungen=h.buchungen.filter(b=>b.zahlungsstatus==='storniert')
                        const bezahlt=aktivBuchungen.every(b=>b.zahlungsstatus==='bezahlt')&&aktivBuchungen.length>0
                        return(
                          <div key={hi} className="border border-gray-200 rounded-xl overflow-hidden">
                            {/* Gruppe Header */}
                            <div className={`px-4 py-3 flex items-center justify-between ${h.rNr?'bg-gray-50':'bg-amber-50'}`}>
                              <div className="flex items-center gap-2">
                                {h.rNr
                                  ?<span className="font-mono text-sm font-bold text-gray-700">📄 {h.rNr}</span>
                                  :<span className="text-sm font-bold text-amber-700">⚡ Nachbuchung (keine Rechnung)</span>
                                }
                                {bezahlt&&<Badge label="Bezahlt" variant="green"/>}
                                {h.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                                <span className="text-xs text-gray-500">€ {aktivBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                              </div>
                              <div className="flex gap-1.5">
                                {h.rNr&&<Btn size="sm" variant="outline" onClick={()=>loadPdf(g,h.rNr!)}>👁 Anzeigen</Btn>}
                                {h.rNr&&<Btn size="sm" variant="outline" disabled={sending===h.rNr} onClick={async()=>{const html=buildHtml(g,h.rNr!,h.buchungen,'Damen und Herren',bezahlt);await sendEmail(g,h.rNr!,html)}}>{sending===h.rNr?'Sendet…':'📧 Senden'}</Btn>}
                                {!h.rNr&&<Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating({group:g,buchungen:h.buchungen});setPreviewMode('new')}}>📄 Rechnung erstellen</Btn>}
                              </div>
                            </div>
                            {/* Buchungen in dieser Gruppe */}
                            <div className="divide-y divide-gray-100">
                              {h.buchungen.map(b=>(
                                <div key={b.id} className={`flex items-center justify-between px-4 py-2.5 ${b.zahlungsstatus==='storniert'?'bg-red-50':'bg-white'}`}>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-medium ${b.zahlungsstatus==='storniert'?'line-through text-gray-400':'text-gray-800'}`}>{b.kurse.titel}</span>
                                    <Badge label={b.zahlungsstatus==='bezahlt'?'Bezahlt':b.zahlungsstatus==='storniert'?'Storniert':'Ausstehend'} variant={b.zahlungsstatus==='bezahlt'?'green':b.zahlungsstatus==='storniert'?'red':'yellow'}/>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-gray-700">€ {b.gebuchter_preis.toFixed(2)}</span>
                                    {b.zahlungsstatus!=='storniert'&&(
                                      <button onClick={()=>storniereBuchung(g,b)} className="text-xs text-red-500 hover:text-red-700 font-semibold border border-red-200 hover:border-red-400 px-2 py-1 rounded-lg transition-all">
                                        Stornieren
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Stornorechnung nötig? */}
                            {h.hatBezahlteUndStorniert&&(
                              <div className="px-4 py-3 bg-red-50 border-t border-red-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-red-500">⚠</span>
                                  <span className="text-xs text-red-700 font-semibold">Stornierte bezahlte Kurse — Stornorechnung erstellen</span>
                                </div>
                                <Btn size="sm" variant="danger" onClick={async()=>{
                                  if(!k)return
                                  const stornierte=h.buchungen.filter(b=>b.zahlungsstatus==='storniert')
                                  const existing=await getAlleRechnungsnummern(k.id)
                                  const nr=nextRechnungsnr(existing,k.jahr)+'S'
                                  setStornoNr(nr);setStornoBuchungen(stornierte);setStornoGroup(g)
                                  setPreviewHtml(buildStornoHtml(g,nr,h.rNr??'',stornierte))
                                  setPreviewNr(nr);setPreviewMode('storno')
                                }}>🔴 Stornorechnung erstellen</Btn>
                              </div>
                            )}
                          </div>
                        )
                      })}
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
        <Modal title={`Rechnung — ${creating.group.tn.nachname} ${creating.group.tn.vorname}`} onClose={()=>setCreating(null)}>
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Anrede</p>
            <div className="flex gap-2 flex-wrap">
              {(['Damen und Herren','Frau','Herr'] as const).map(a=>(
                <button key={a} onClick={()=>setAnrede(a)} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>(
              <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-200 last:border-0">
                <span>{b.kurse.titel}</span><span className="font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold mt-2 pt-2 border-t">
              <span>Gesamt inkl. 20% MwSt.</span>
              <span>€ {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setCreating(null)}>Abbrechen</Btn>
            <Btn onClick={async()=>{
              if(!k||!creating)return
              const existing=await getAlleRechnungsnummern(k.id)
              const nr=nextRechnungsnr(existing,k.jahr)
              const anredeText=anrede==='Damen und Herren'?'Damen und Herren':`${anrede} ${creating.group.tn.nachname}`
              const bezahlt=creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')
              setPreviewNr(nr);setPreviewHtml(buildHtml(creating.group,nr,creating.buchungen,anredeText,bezahlt));setPreviewMode('new')
            }}>Vorschau →</Btn>
          </div>
        </Modal>
      )}

      {/* VORSCHAU MODAL */}
      {previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className={`flex items-center justify-between px-6 py-4 border-b ${previewMode==='storno'?'bg-red-50':''}`}>
              <div>
                <h2 className={`font-bold text-base ${previewMode==='storno'?'text-red-700':''}`}>
                  {previewMode==='storno'?'Stornorechnung':'Rechnung'} — {previewNr}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {previewMode==='new'?'Neu erstellt — bitte überprüfen':previewMode==='storno'?'Gutschrift zur Original-Rechnung':'Gespeicherte Rechnung'}
                </p>
              </div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreviewHtml(null);setCreating(null);setStornoGroup(null)}}>← Schließen</Btn>
                {previewMode==='new'&&creating&&<Btn onClick={saveRechnung} disabled={saving}>{saving?'Speichert…':'✓ Speichern & Drucken'}</Btn>}
                {previewMode==='storno'&&stornoGroup&&<Btn onClick={saveStorno} disabled={saving}>{saving?'Speichert…':'✓ Speichern & Drucken'}</Btn>}
                {previewMode==='existing'&&<Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(previewHtml!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>}
                {previewMode==='existing'&&<Btn variant="outline" disabled={sending===previewNr} onClick={async()=>{
                  const g=groups.find(g=>g.buchungen.some(b=>b.rechnungsnummer===previewNr))
                  if(g&&previewHtml)await sendEmail(g,previewNr,previewHtml)
                }}>{sending===previewNr?'Sendet…':'📧 Senden'}</Btn>}
              </div>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

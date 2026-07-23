'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,type Kongress}from'@/lib/db'
import{buildRechnungHTML,type MwstTyp}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;gebucht_am:string;teilnehmer_id:number;kurse:{titel:string}}
type TN={id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean}
type TGroup={tnId:number;tn:TN;buchungen:Buchung[]}

function calcStornoErstattung(betrag:number,k:Kongress):{erstattung:number;einbehalt:number;typ:'kostenlos'|'50prozent'|'keine'}{
  const heute=new Date()
  const kostenlosBis=new Date(k.storno_kostenlos_bis)
  const fuenfzigBis=new Date(k.storno_50_bis)
  if(heute<=kostenlosBis)return{erstattung:betrag,einbehalt:0,typ:'kostenlos'}
  if(heute<=fuenfzigBis)return{erstattung:Math.round(betrag*0.5*100)/100,einbehalt:Math.round(betrag*0.5*100)/100,typ:'50prozent'}
  return{erstattung:0,einbehalt:betrag,typ:'keine'}
}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[groups,setGroups]=useState<TGroup[]>([])
  const[loading,setLoading]=useState(true)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[previewHtml,setPreviewHtml]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[previewMode,setPreviewMode]=useState<'new'|'existing'|'storno'|'korrigiert'>('new')
  const[creating,setCreating]=useState<{group:TGroup;buchungen:Buchung[]}|null>(null)
  const[anrede,setAnrede]=useState<string>('Damen und Herren')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<string|null>(null)
  const[teilstornoGroup,setTeilstornoGroup]=useState<TGroup|null>(null)
  const[teilstornoRechNr,setTeilstornoRechNr]=useState<string|null>(null)
  const[teilstornoBuchungen,setTeilstornoBuchungen]=useState<Buchung[]>([])
  const[teilstornoSelected,setTeilstornoSelected]=useState<Set<number>>(new Set())
  const[erinnerungSending,setErinnerungSending]=useState<number|null>(null)
  const[korrigiertAngebot,setKorrigiertAngebot]=useState<{group:TGroup;buchungen:Buchung[];stornoNr:string}|null>(null)
  const[stornoCalcState,setStornoCalcState]=useState<{erstattung:number;einbehalt:number;typ:string}|null>(null)

  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);await load(k.id);setLoading(false)})},[])

  async function load(kid:number){
    const{data:b}=await supabase.from('buchungen')
      .select('id,kurs_id,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel)')
      .eq('kongress_id',kid).gt('gebuchter_preis',0).order('gebucht_am',{ascending:false})
    const map:Record<number,TGroup>={}
    ;(b??[]).forEach((x:any)=>{
      const tid=x.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,tn:x.teilnehmer,buchungen:[]}
      map[tid].buchungen.push({id:x.id,kurs_id:x.kurs_id,gebuchter_preis:x.gebuchter_preis,zahlungsstatus:x.zahlungsstatus,rechnungsnummer:x.rechnungsnummer,rechnung_versendet_am:x.rechnung_versendet_am,gebucht_am:x.gebucht_am,teilnehmer_id:tid,kurse:x.kurse})
    })
    setGroups(Object.values(map).sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname)))
  }

  function getHistorie(buchungen:Buchung[]):{rNr:string|null;buchungen:Buchung[];allBezahlt:boolean;hasOffen:boolean;versendetAm:string|null;isStorno:boolean}[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{const key=b.rechnungsnummer??'__ohne__';if(!map[key])map[key]=[];map[key].push(b)})
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne__'?null:key,
      buchungen:bs,
      allBezahlt:bs.every(b=>b.zahlungsstatus==='bezahlt'||b.zahlungsstatus==='storniert'),
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
      versendetAm:bs.find(b=>b.rechnung_versendet_am)?.rechnung_versendet_am??null,
      isStorno:(key.includes('S')||key.includes('K'))&&key!=='__ohne__',
    }))
  }

  function buildHtml(g:TGroup,nr:string,buchungen:Buchung[],anredeText:string,bezahlt:boolean):string{
    if(!k)return''
    const aktiv=buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    return buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:anredeText,empfaenger_name:`${g.tn.vorname} ${g.tn.nachname}`,
      empfaenger_strasse:`${g.tn.strasse} ${g.tn.hausnummer}`,
      empfaenger_plz_ort:`${g.tn.postleitzahl} ${g.tn.stadt}`,
      empfaenger_land:g.tn.land,empfaenger_kennung:`ÖÄK Nr.: ${g.tn.oeak_nr}`,
      positionen:aktiv.map(b=>({bezeichnung:b.kurse.titel,menge:1,einzelpreis:b.gebuchter_preis})),
      mwst_typ:'mit_mwst',bezahlt,kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`Vielen Dank für Ihr Interesse am Sportmedizin Kongress ${k.jahr}.`,
    })
  }

  function buildStornoHtml(g:TGroup,stornoNr:string,origNr:string,stornierte:Buchung[],erstattung:number,einbehalt:number,stornoTyp:string):string{
    if(!k)return''
    const bruttoGesamt=stornierte.reduce((s,b)=>s+b.gebuchter_preis,0)
    const netto=erstattung>0?erstattung/1.2:0
    const mwst=erstattung-netto
    const heute=new Date().toLocaleDateString('de-AT')
    const stornoText=stornoTyp==='kostenlos'?'Da die kostenlose Stornofrist noch nicht abgelaufen ist, erstatten wir Ihnen den vollen Betrag.':stornoTyp==='50prozent'?`Da die kostenlose Stornofrist abgelaufen ist, behalten wir gemäß unseren AGB 50% (€ ${einbehalt.toFixed(2)}) ein.`:'Leider ist die Stornofrist abgelaufen. Gemäß unseren AGB kann keine Erstattung erfolgen.'
    const posTR=stornierte.map((b,i)=>`<tr><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${i+1}.</td><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${b.kurse.titel}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:10px">1</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px">−${b.gebuchter_preis.toFixed(2)}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px;color:#dc2626">−${stornoTyp==='kostenlos'?b.gebuchter_preis.toFixed(2):stornoTyp==='50prozent'?(b.gebuchter_preis*0.5).toFixed(2):'0.00'}</td></tr>`).join('')
    return`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm 20mm 20mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm"><div></div><div style="text-align:right"><img src="/logo.svg" style="height:18mm;width:auto;display:block;margin-left:auto;margin-bottom:6px"/><div style="font-size:10px;line-height:1.8;color:#333"><div>${heute}</div></div></div></div>
<div style="margin-bottom:7mm;font-size:10px;line-height:1.8"><div style="font-weight:bold">${g.tn.vorname} ${g.tn.nachname}</div><div>${g.tn.strasse} ${g.tn.hausnummer}</div><div>${g.tn.postleitzahl} ${g.tn.stadt}</div><div style="color:#555;margin-top:2px">ÖÄK Nr.: ${g.tn.oeak_nr}</div></div>
<div style="margin-bottom:4mm"><div style="font-size:16px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div><div style="font-size:11px;font-weight:bold;margin-top:2px">zur Rechnung ${origNr} — ${k.name} ${k.jahr}</div></div>
<div style="margin-bottom:5mm;font-size:10px">Stornorechnung-Nr.: <strong>${stornoNr}</strong></div>
<div style="margin-bottom:5mm;font-size:10px;line-height:1.7"><p>Sehr geehrte Damen und Herren,</p><br><p>hiermit stornieren wir folgende Position(en):</p><br><p>${stornoText}</p></div>
<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm"><thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:center;width:8%">Menge</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Ursprungspreis</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Erstattung</th></tr></thead><tbody>${posTR}</tbody></table>
${erstattung>0?`<div style="display:flex;justify-content:flex-end;margin-bottom:5mm"><table style="width:240px;border-collapse:collapse">${stornoTyp==='50prozent'?`<tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ursprungsbetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0">−${bruttoGesamt.toFixed(2)}</td></tr><tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Stornogebühr 50%</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0;color:#dc2626">+${einbehalt.toFixed(2)}</td></tr>`:''}<tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Nettobetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0">−${netto.toFixed(2)}</td></tr><tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ust. 20% inkl.</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0">−${mwst.toFixed(2)}</td></tr><tr style="border-top:2px solid #dc2626"><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0 4px;color:#dc2626">Rückerstattung</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0 4px;color:#dc2626">−${erstattung.toFixed(2)}</td></tr></table></div><p style="font-size:10px;color:#555;margin-bottom:8mm">Der Betrag von EUR ${erstattung.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>`:`<p style="font-size:10px;color:#dc2626;font-weight:bold;margin-bottom:8mm">Gemäß unseren AGB erfolgt keine Rückerstattung nach Ablauf der Stornofrist.</p>`}
<div style="font-size:10px;line-height:1.9;margin-top:8mm"><p>Mit sportlichen Grüßen</p><br><br><p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p><p>Kongresspräsident</p></div>
<div style="position:fixed;bottom:10mm;left:20mm;right:20mm;padding-top:5mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:9px;color:#555"><div><div style="font-weight:bold;margin-bottom:3px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz</div><div>UID: ATU 61957546</div></div><div><div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div><div>IBAN: AT67 1912 0500 9922 3610</div><div>BIC: SPBAATWW · Bank99</div></div><div><div style="font-weight:bold;margin-bottom:3px">Kontakt</div><div>Tel.: 04852 61952-52</div><div>info@sportmedizin-arlberg.at</div></div></div>
</body></html>`
  }

  async function saveRechnung(){
    if(!creating||!k||!previewNr||!previewHtml)return
    setSaving(true)
    const tn=creating.group.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    for(const b of creating.buchungen){await supabase.from('buchungen').update({rechnungsnummer:previewNr}).eq('id',b.id)}
    const aktiv=creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const brutto=aktiv.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:creating.group.tnId,rechnungsnummer:previewNr,typ:'teilnehmer',anrede,gesamtbetrag_brutto:brutto,netto:brutto/1.2,mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,bezahlt:aktiv.every(b=>b.zahlungsstatus==='bezahlt'),erstellt_am:new Date().toISOString()})
    setPreviewHtml(null);setCreating(null)
    await load(k.id);setSaving(false)
  }

  async function saveTeilstorno(erstattung:number,einbehalt:number,stornoTyp:string){
    if(!teilstornoGroup||!k||!previewHtml||!previewNr)return
    setSaving(true)
    const tn=teilstornoGroup.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    const storniertIds=Array.from(teilstornoSelected)
    for(const id of storniertIds){await supabase.from('buchungen').update({zahlungsstatus:'storniert'}).eq('id',id)}
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:teilstornoGroup.tnId,rechnungsnummer:previewNr,typ:'storno',anrede:'Damen und Herren',gesamtbetrag_brutto:-erstattung,netto:-erstattung/1.2,mwst_betrag:-(erstattung-(erstattung/1.2)),mwst_prozent:20,bezahlt:false,erstellt_am:new Date().toISOString()})

    // Find remaining paid bookings for korrigierte rechnung offer
    const verbleibend=teilstornoGroup.buchungen.filter(b=>!storniertIds.includes(b.id)&&b.zahlungsstatus==='bezahlt')
    const savedGroup={...teilstornoGroup}
    const savedNr=previewNr

    setPreviewHtml(null)
    setTeilstornoGroup(null);setTeilstornoBuchungen([]);setTeilstornoSelected(new Set())
    setStornoCalcState(null)
    await load(k.id);setSaving(false)

    // Offer korrigierte rechnung
    if(verbleibend.length>0){
      const updatedGroup=groups.find(g=>g.tnId===savedGroup.tnId)??savedGroup
      setKorrigiertAngebot({group:updatedGroup,buchungen:verbleibend,stornoNr:savedNr})
    }
  }

  async function sendEmail(g:TGroup,nr:string,html:string){
    if(!k)return
    setSending(nr)
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,rechnungsnummer:nr,html,kongress_name:k.name})})
    for(const b of g.buchungen.filter(b=>b.rechnungsnummer===nr)){await supabase.from('buchungen').update({rechnung_versendet_am:new Date().toISOString()}).eq('id',b.id)}
    await load(k.id);setSending(null)
  }

  async function sendZahlungserinnerung(g:TGroup){
    if(!k)return
    setErinnerungSending(g.tnId)
    const offene=g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend')
    const betrag=offene.reduce((s,b)=>s+b.gebuchter_preis,0)
    await fetch('/api/send-zahlungserinnerung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,betrag,kurse:offene.map(b=>b.kurse.titel),kongress_name:k.name,kongress_jahr:k.jahr,iban:k.iban,bic:k.bic,kontoinhaber:k.kontoinhaber,kontakt_email:k.kontakt_email})})
    setErinnerungSending(null)
  }

  async function loadPdf(g:TGroup,nr:string){
    if(!k)return
    const tn=g.tn
    const{data}=await supabase.storage.from('rechnungen').download(`${k.jahr}/${tn.nachname}_${tn.vorname}_${nr}.html`)
    if(data){const text=await data.text();setPreviewHtml(text);setPreviewNr(nr);setPreviewMode('existing')}
    else{
      const buchungen=g.buchungen.filter(b=>b.rechnungsnummer===nr)
      const bezahlt=buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')
      setPreviewHtml(buildHtml(g,nr,buchungen,'Damen und Herren',bezahlt));setPreviewNr(nr);setPreviewMode('existing')
    }
  }

  function openTeilstorno(g:TGroup,rNr:string){
    const buchungen=g.buchungen.filter(b=>b.rechnungsnummer===rNr&&b.zahlungsstatus==='bezahlt')
    setTeilstornoGroup(g);setTeilstornoRechNr(rNr);setTeilstornoBuchungen(buchungen);setTeilstornoSelected(new Set());setStornoCalcState(null)
  }

  const selectedTeilstornoBuchungen=teilstornoBuchungen.filter(b=>teilstornoSelected.has(b.id))
  const teilstornoGesamt=selectedTeilstornoBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
  const stornoCalc=k&&teilstornoGesamt>0?calcStornoErstattung(teilstornoGesamt,k):null

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
              const hatOffeneOhneRechnung=g.buchungen.some(b=>!b.rechnungsnummer&&b.zahlungsstatus==='bezahlt')
              const alleRechNummern=Array.from(new Set(g.buchungen.map(b=>b.rechnungsnummer).filter(Boolean)))
              const hatAusstehend=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              return(
                <div key={g.tnId} className={i>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{g.tn.nachname} {g.tn.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.tn.email}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {alleRechNummern.map(nr=><span key={nr} className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{nr}</span>)}
                      {hatOffeneOhneRechnung&&<Badge label="Ohne Rechnung" variant="yellow"/>}
                      {hatAusstehend&&<Badge label="Ausstehend" variant="yellow"/>}
                    </div>
                  </div>
                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4 space-y-3">
                      {hatAusstehend&&(
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Zahlung ausstehend</p>
                            <p className="text-xs text-amber-600 mt-0.5">€ {g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)} offen</p>
                          </div>
                          <Btn size="sm" variant="outline" disabled={erinnerungSending===g.tnId} onClick={()=>sendZahlungserinnerung(g)}>
                            {erinnerungSending===g.tnId?'Sendet…':'📧 Zahlungserinnerung'}
                          </Btn>
                        </div>
                      )}
                      {historie.map((h,hi)=>{
                        const aktivBuchungen=h.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
                        const bezahlt=aktivBuchungen.every(b=>b.zahlungsstatus==='bezahlt')&&aktivBuchungen.length>0
                        const versendet=h.versendetAm
                        const isStornoRechnung=h.rNr&&(h.rNr.includes('S')||h.rNr.includes('K'))
                        return(
                          <div key={hi} className={`border rounded-xl overflow-hidden ${isStornoRechnung?'border-red-100':'border-gray-200'}`}>
                            <div className={`px-4 py-3 flex items-center justify-between ${isStornoRechnung?'bg-red-50':h.rNr?'bg-gray-50':'bg-amber-50'}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                {h.rNr
                                  ?<span className={`font-mono text-sm font-bold ${isStornoRechnung?'text-red-700':'text-gray-700'}`}>
                                    {isStornoRechnung?'🔴':'📄'} {h.rNr}
                                  </span>
                                  :<span className="text-sm font-bold text-amber-700">⚡ Ohne Rechnung</span>
                                }
                                {bezahlt&&!isStornoRechnung&&<Badge label="Bezahlt" variant="green"/>}
                                {h.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                                {isStornoRechnung&&<Badge label="Stornorechnung" variant="red"/>}
                                {versendet&&<span className="text-[10px] text-gray-400">📧 {new Date(versendet).toLocaleDateString('de-AT')}</span>}
                                <span className="text-xs text-gray-500">€ {aktivBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {h.rNr&&<Btn size="sm" variant="outline" onClick={()=>loadPdf(g,h.rNr!)}>👁 Anzeigen</Btn>}
                                {h.rNr&&(bezahlt||isStornoRechnung)&&(
                                  <Btn size="sm" variant="outline" disabled={sending===h.rNr} onClick={async()=>{
                                    await loadPdf(g,h.rNr!)
                                    if(previewHtml)await sendEmail(g,h.rNr!,previewHtml)
                                  }}>
                                    {sending===h.rNr?'Sendet…':versendet?'📧 Erneut':'📧 Senden'}
                                  </Btn>
                                )}
                                {h.rNr&&!bezahlt&&!isStornoRechnung&&<span className="text-[10px] text-gray-400 italic">Erst nach Zahlung senden</span>}
                                {h.rNr&&bezahlt&&!isStornoRechnung&&aktivBuchungen.length>0&&(
                                  <Btn size="sm" variant="danger" onClick={()=>openTeilstorno(g,h.rNr!)}>🔴 Teilstorno</Btn>
                                )}
                                {!h.rNr&&(
                                  bezahlt
                                    ?<Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating({group:g,buchungen:h.buchungen});setPreviewMode('new')}}>📄 Rechnung erstellen</Btn>
                                    :<span className="text-[10px] text-gray-400 italic">Erst nach Zahlung</span>
                                )}
                              </div>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {h.buchungen.map(b=>(
                                <div key={b.id} className={`flex items-center justify-between px-4 py-2.5 ${b.zahlungsstatus==='storniert'?'bg-red-50':'bg-white'}`}>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-medium ${b.zahlungsstatus==='storniert'?'line-through text-gray-400':'text-gray-800'}`}>{b.kurse.titel}</span>
                                    <Badge label={b.zahlungsstatus==='bezahlt'?'Bezahlt':b.zahlungsstatus==='storniert'?'Storniert':'Ausstehend'} variant={b.zahlungsstatus==='bezahlt'?'green':b.zahlungsstatus==='storniert'?'red':'yellow'}/>
                                  </div>
                                  <span className="text-sm font-bold text-gray-700">€ {b.gebuchter_preis.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
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
              {['Damen und Herren','Frau','Herr'].map(a=>(
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

      {/* TEILSTORNO MODAL */}
      {teilstornoGroup&&!previewHtml&&(
        <Modal title={`Teilstorno — ${teilstornoGroup.tn.nachname} ${teilstornoGroup.tn.vorname}`} onClose={()=>{setTeilstornoGroup(null);setTeilstornoBuchungen([]);setTeilstornoSelected(new Set());setStornoCalcState(null)}} wide>
          <div className="space-y-4">
            {k&&(
              <div className="grid grid-cols-3 gap-3 text-xs">
                {[{label:'Kostenlos bis',date:k.storno_kostenlos_bis},{label:'50% Gebühr bis',date:k.storno_50_bis},{label:'Danach',date:null}].map(f=>{
                  const heute=new Date()
                  const d=f.date?new Date(f.date):null
                  const aktiv=d?heute<=d:!new Date(k.storno_50_bis)||heute>new Date(k.storno_50_bis)
                  return(
                    <div key={f.label} className={`rounded-xl p-3 border ${f.date&&new Date()<=new Date(f.date)?'bg-green-50 border-green-200':f.date?'bg-gray-50 border-gray-200':'bg-red-50 border-red-200'}`}>
                      <p className="font-bold text-gray-700">{f.label}</p>
                      <p className="text-gray-500">{f.date?new Date(f.date).toLocaleDateString('de-AT'):'Keine Erstattung'}</p>
                    </div>
                  )
                })}
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Welche Kurse stornieren?</p>
              {teilstornoBuchungen.map(b=>(
                <label key={b.id} className={`flex items-center justify-between p-3 rounded-xl border mb-2 cursor-pointer transition-all ${teilstornoSelected.has(b.id)?'border-red-300 bg-red-50':'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={teilstornoSelected.has(b.id)} onChange={e=>{
                      const next=new Set(teilstornoSelected)
                      e.target.checked?next.add(b.id):next.delete(b.id)
                      setTeilstornoSelected(next)
                    }} className="accent-red-500"/>
                    <span className="text-sm font-semibold">{b.kurse.titel}</span>
                  </div>
                  <span className="text-sm font-bold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </label>
              ))}
            </div>
            {stornoCalc&&teilstornoGesamt>0&&(
              <div className={`rounded-xl p-4 border ${stornoCalc.typ==='keine'?'bg-red-50 border-red-200':stornoCalc.typ==='50prozent'?'bg-amber-50 border-amber-200':'bg-green-50 border-green-200'}`}>
                <p className="text-xs font-bold uppercase tracking-widest mb-3 text-gray-600">Berechnung</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><span>Gebuchter Betrag</span><span className="font-semibold">€ {teilstornoGesamt.toFixed(2)}</span></div>
                  {stornoCalc.typ==='50prozent'&&<div className="flex justify-between text-amber-700"><span>Stornogebühr 50%</span><span className="font-semibold">− € {stornoCalc.einbehalt.toFixed(2)}</span></div>}
                  <div className={`flex justify-between font-bold text-base border-t pt-2 mt-2 ${stornoCalc.typ==='keine'?'text-red-700':stornoCalc.typ==='50prozent'?'text-amber-700':'text-green-700'}`}>
                    <span>{stornoCalc.typ==='keine'?'Keine Erstattung':'Erstattung'}</span>
                    <span>€ {stornoCalc.erstattung.toFixed(2)}</span>
                  </div>
                </div>
                {stornoCalc.typ==='keine'&&<p className="text-xs text-red-600 mt-2 font-medium">⚠ Stornofrist abgelaufen — keine Rückerstattung.</p>}
              </div>
            )}
            <div className="flex gap-3 justify-end pt-2">
              <Btn variant="outline" onClick={()=>{setTeilstornoGroup(null);setTeilstornoBuchungen([]);setTeilstornoSelected(new Set())}}>Abbrechen</Btn>
              <Btn variant="danger" disabled={teilstornoSelected.size===0} onClick={async()=>{
                if(!k||!teilstornoGroup||!stornoCalc)return
                const existing=await getAlleRechnungsnummern(k.id)
                const baseNr=teilstornoRechNr??nextRechnungsnr(existing,k.jahr)
                const stornoNr=`${baseNr}S`
                const html=buildStornoHtml(teilstornoGroup,stornoNr,teilstornoRechNr??'',selectedTeilstornoBuchungen,stornoCalc.erstattung,stornoCalc.einbehalt,stornoCalc.typ)
                setStornoCalcState({erstattung:stornoCalc.erstattung,einbehalt:stornoCalc.einbehalt,typ:stornoCalc.typ})
                setPreviewHtml(html);setPreviewNr(stornoNr);setPreviewMode('storno')
              }}>Stornorechnung erstellen →</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* KORRIGIERTE RECHNUNG ANBIETEN */}
      {korrigiertAngebot&&!previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
            <h2 className="font-bold text-base mb-2">✓ Storno gespeichert — korrigierte Rechnung?</h2>
            <p className="text-sm text-gray-500 mb-4">Möchtest du eine neue korrigierte Sammelrechnung für die verbleibenden {korrigiertAngebot.buchungen.length} Kurse erstellen?</p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              {korrigiertAngebot.buchungen.map(b=>(
                <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                  <span>{b.kurse.titel}</span>
                  <span className="font-bold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 mt-1">
                <span>Gesamt</span>
                <span>€ {korrigiertAngebot.buchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Btn variant="outline" onClick={()=>setKorrigiertAngebot(null)}>Später</Btn>
              <Btn onClick={async()=>{
                if(!k||!korrigiertAngebot)return
                const existing=await getAlleRechnungsnummern(k.id)
                const nr=`${korrigiertAngebot.stornoNr.replace('S','')}K`
                const html=buildHtml(korrigiertAngebot.group,nr,korrigiertAngebot.buchungen,'Damen und Herren',true)
                for(const b of korrigiertAngebot.buchungen){
                  await supabase.from('buchungen').update({rechnungsnummer:nr}).eq('id',b.id)
                }
                setPreviewHtml(html);setPreviewNr(nr);setPreviewMode('korrigiert')
                setCreating({group:korrigiertAngebot.group,buchungen:korrigiertAngebot.buchungen})
                setKorrigiertAngebot(null)
              }}>📄 Korrigierte Rechnung erstellen</Btn>
            </div>
          </div>
        </div>
      )}

      {/* VORSCHAU MODAL */}
      {previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className={`flex items-center justify-between px-6 py-4 border-b ${previewMode==='storno'?'bg-red-50':previewMode==='korrigiert'?'bg-blue-50':''}`}>
              <div>
                <h2 className={`font-bold text-base ${previewMode==='storno'?'text-red-700':previewMode==='korrigiert'?'text-blue-700':''}`}>
                  {previewMode==='storno'?'🔴 Stornorechnung':previewMode==='korrigiert'?'📄 Korrigierte Rechnung':'📄 Rechnung'} — {previewNr}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {previewMode==='new'||previewMode==='korrigiert'?'Neu erstellt — bitte überprüfen vor dem Speichern':previewMode==='storno'?'Stornorechnung prüfen':'Gespeicherte Rechnung'}
                </p>
              </div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreviewHtml(null);if(previewMode!=='existing'){setCreating(null)}}}>← Schließen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(previewHtml!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>
                {(previewMode==='new'||previewMode==='korrigiert')&&creating&&(
                  <Btn onClick={saveRechnung} disabled={saving}>{saving?'Speichert…':'✓ Speichern'}</Btn>
                )}
                {previewMode==='storno'&&teilstornoGroup&&stornoCalcState&&(
                  <Btn variant="danger" onClick={()=>saveTeilstorno(stornoCalcState.erstattung,stornoCalcState.einbehalt,stornoCalcState.typ)} disabled={saving}>
                    {saving?'Speichert…':'✓ Stornorechnung speichern'}
                  </Btn>
                )}
                {previewMode==='existing'&&(()=>{
                  const g=groups.find(g=>g.buchungen.some(b=>b.rechnungsnummer===previewNr))
                  if(!g)return null
                  return<Btn variant="outline" disabled={sending===previewNr} onClick={async()=>{if(previewHtml)await sendEmail(g,previewNr,previewHtml)}}>{sending===previewNr?'Sendet…':'📧 Senden'}</Btn>
                })()}
              </div>
            </div>
            <iframe srcDoc={previewHtml} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

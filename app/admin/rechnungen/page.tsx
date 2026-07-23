'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,getAlleRechnungsnummern,nextRechnungsnr,type Kongress,type Kurs}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;gebucht_am:string;teilnehmer_id:number;kurse:{titel:string;fruehbucher_preis:number;spaetbucher_preis:number}}
type TN={id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean}
type TGroup={tnId:number;tn:TN;buchungen:Buchung[]}

function calcStornoErstattung(betrag:number,k:Kongress):{erstattung:number;einbehalt:number;typ:'kostenlos'|'50prozent'|'keine'}{
  const h=new Date()
  if(h<=new Date(k.storno_kostenlos_bis))return{erstattung:betrag,einbehalt:0,typ:'kostenlos'}
  if(h<=new Date(k.storno_50_bis))return{erstattung:Math.round(betrag*0.5*100)/100,einbehalt:Math.round(betrag*0.5*100)/100,typ:'50prozent'}
  return{erstattung:0,einbehalt:betrag,typ:'keine'}
}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[alleKurse,setAlleKurse]=useState<Kurs[]>([])
  const[groups,setGroups]=useState<TGroup[]>([])
  const[loading,setLoading]=useState(true)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[previewHtml,setPreviewHtml]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[previewMode,setPreviewMode]=useState<'new'|'storno'|'existing'>('new')
  const[creating,setCreating]=useState<{group:TGroup;buchungen:Buchung[]}|null>(null)
  const[anrede,setAnrede]=useState('Damen und Herren')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<string|null>(null)
  const[erinnerungSending,setErinnerungSending]=useState<number|null>(null)
  const[stornoGroup,setStornoGroup]=useState<TGroup|null>(null)
  const[stornoRechNr,setStornoRechNr]=useState<string|null>(null)
  const[stornoCalc,setStornoCalc]=useState<{erstattung:number;einbehalt:number;typ:string}|null>(null)
  const[neueRechModal,setNeueRechModal]=useState<{group:TGroup;items:{kurs:Kurs;buchung:Buchung|null;preis:number;selected:boolean}[]}|null>(null)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[,kk]=await Promise.all([load(k.id),getKurse(k.id)])
    setAlleKurse(kk)
    setLoading(false)
  })},[])

  async function load(kid:number){
    const{data}=await supabase.from('buchungen')
      .select('id,kurs_id,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel,fruehbucher_preis,spaetbucher_preis)')
      .eq('kongress_id',kid).gt('gebuchter_preis',0).order('gebucht_am',{ascending:false})
    const map:Record<number,TGroup>={}
    ;(data??[]).forEach((x:any)=>{
      const tid=x.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,tn:x.teilnehmer,buchungen:[]}
      map[tid].buchungen.push({id:x.id,kurs_id:x.kurs_id,gebuchter_preis:x.gebuchter_preis,zahlungsstatus:x.zahlungsstatus,rechnungsnummer:x.rechnungsnummer,rechnung_versendet_am:x.rechnung_versendet_am,gebucht_am:x.gebucht_am,teilnehmer_id:tid,kurse:x.kurse})
    })
    setGroups(Object.values(map).sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname)))
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
      intro_text:`Vielen Dank für Ihre Anmeldung zum ${k.name} ${k.jahr}.`,
    })
  }

  function buildStornoHtml(g:TGroup,sNr:string,origNr:string,buchungen:Buchung[],erstattung:number,einbehalt:number,typ:string):string{
    if(!k)return''
    const brutto=buchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
    const netto=erstattung>0?Math.round(erstattung/1.2*100)/100:0
    const mwst=Math.round((erstattung-netto)*100)/100
    const heute=new Date().toLocaleDateString('de-AT')
    const stornoText=typ==='kostenlos'?'Da die kostenlose Stornofrist noch nicht abgelaufen ist, erstatten wir den vollen Betrag.':typ==='50prozent'?`Da die kostenlose Stornofrist abgelaufen ist, behalten wir gemäß AGB 50% (€ ${einbehalt.toFixed(2)}) ein.`:'Die Stornofrist ist abgelaufen. Gemäß AGB erfolgt keine Rückerstattung.'
    const rows=buchungen.map((b,i)=>`<tr><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${i+1}.</td><td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${b.kurse.titel}</td><td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px">−€ ${b.gebuchter_preis.toFixed(2)}</td></tr>`).join('')
    return`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm 20mm 20mm 20mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#111}@media print{body{-webkit-print-color-adjust:exact}}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm"><div><div style="font-size:10px;font-weight:700;color:#555">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div style="font-size:10px;color:#777">Österreichische Gesellschaft für Sportmedizin</div></div><img src="/logo.svg" style="height:18mm;width:auto" onerror="this.style.display='none'"/></div>
<div style="margin-bottom:6mm;font-size:10px;line-height:1.8"><div style="font-weight:bold">${g.tn.vorname} ${g.tn.nachname}</div><div>${g.tn.strasse} ${g.tn.hausnummer} · ${g.tn.postleitzahl} ${g.tn.stadt}</div><div style="color:#555">ÖÄK Nr.: ${g.tn.oeak_nr}</div></div>
<div style="margin-bottom:4mm"><div style="font-size:15px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div><div style="font-size:10px;color:#555;margin-top:2px">Nr.: <strong>${sNr}</strong> · zur Rechnung ${origNr} · ${heute}</div></div>
<div style="font-size:10px;line-height:1.7;margin-bottom:5mm"><p>Sehr geehrte Damen und Herren,</p><br><p>wir stornieren Ihre Rechnung ${origNr} vollständig. ${stornoText}</p></div>
<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm"><thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:18%">Betrag</th></tr></thead><tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-bottom:5mm"><table style="width:260px">${typ==='50prozent'?`<tr><td style="font-size:10px;padding:3px 0;color:#555">Gesamtbetrag</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${brutto.toFixed(2)}</td></tr><tr><td style="font-size:10px;padding:3px 0;color:#dc2626">Stornogebühr 50%</td><td style="text-align:right;font-size:10px;padding:3px 0;color:#dc2626">+€ ${einbehalt.toFixed(2)}</td></tr>`:''} ${erstattung>0?`<tr><td style="font-size:10px;padding:3px 0;color:#555">Netto</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${netto.toFixed(2)}</td></tr><tr><td style="font-size:10px;padding:3px 0;color:#555">Ust. 20% inkl.</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${mwst.toFixed(2)}</td></tr>`:''}<tr style="border-top:2px solid #dc2626"><td style="font-weight:bold;font-size:12px;padding:5px 0;color:#dc2626">${erstattung>0?'Rückerstattung':'Keine Erstattung'}</td><td style="text-align:right;font-weight:bold;font-size:13px;padding:5px 0;color:#dc2626">${erstattung>0?`−€ ${erstattung.toFixed(2)}`:'€ 0.00'}</td></tr></table></div>
${erstattung>0?`<p style="font-size:10px;color:#555;margin-bottom:8mm">EUR ${erstattung.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>`:`<p style="font-size:10px;font-weight:bold;color:#dc2626;margin-bottom:8mm">Gemäß AGB erfolgt keine Rückerstattung.</p>`}
<div style="margin-top:10mm;font-size:10px;line-height:1.9"><p>Mit sportlichen Grüßen</p><br><br><p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p><p style="color:#555">Kongresspräsident</p></div>
<div style="position:fixed;bottom:10mm;left:20mm;right:20mm;padding-top:4mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;font-size:8px;color:#555"><div><div style="font-weight:bold;margin-bottom:2px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz · UID: ATU 61957546</div></div><div><div style="font-weight:bold;margin-bottom:2px">Bank</div><div>IBAN: AT67 1912 0500 9922 3610 · BIC: SPBAATWW</div></div><div style="text-align:right"><div style="font-weight:bold;margin-bottom:2px">Kontakt</div><div>Tel.: 04852 61952-52 · info@sportmedizin-arlberg.at</div></div></div>
</body></html>`
  }

  async function saveRechnung(){
    if(!creating||!k||!previewNr||!previewHtml)return
    setSaving(true)
    console.log('saveRechnung: buchungen count=',creating.buchungen.length, 'ids=',creating.buchungen.map(b=>b.id), 'nr=',previewNr)
    const tn=creating.group.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    for(const b of creating.buchungen){await supabase.from('buchungen').update({rechnungsnummer:previewNr}).eq('id',b.id)}
    const brutto=creating.buchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:creating.group.tnId,rechnungsnummer:previewNr,typ:'teilnehmer',anrede,gesamtbetrag_brutto:brutto,netto:brutto/1.2,mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,bezahlt:true,erstellt_am:new Date().toISOString()})
    setPreviewHtml(null);setCreating(null);setPreviewNr('')
    await load(k.id);setSaving(false)
  }

  async function saveStorno(){
    if(!stornoGroup||!k||!previewHtml||!previewNr||!stornoRechNr||!stornoCalc)return
    setSaving(true)
    const tn=stornoGroup.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    const stornierteBuchungen=stornoGroup.buchungen.filter(b=>b.rechnungsnummer===stornoRechNr&&b.zahlungsstatus==='bezahlt')
    for(const b of stornierteBuchungen){await supabase.from('buchungen').update({zahlungsstatus:'storniert'}).eq('id',b.id)}
    const e=stornoCalc.erstattung
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:stornoGroup.tnId,rechnungsnummer:previewNr,typ:'storno',anrede:'Damen und Herren',gesamtbetrag_brutto:-e,netto:-e/1.2,mwst_betrag:-(e-(e/1.2)),mwst_prozent:20,bezahlt:false,erstellt_am:new Date().toISOString()})
    const savedGroup={...stornoGroup}
    const alleBuchungen=[...stornoGroup.buchungen]
    setPreviewHtml(null);setStornoGroup(null);setStornoRechNr(null);setStornoCalc(null);setPreviewNr('')
    await load(k.id);setSaving(false)
    // Open neue rechnung modal
    const isFrueh=new Date()<=new Date(k.fruehbucher_bis)
    const items=alleKurse.filter(kk=>!kk.ist_pflichtprogramm).map(kurs=>{
      const existingB=alleBuchungen.find(b=>b.kurs_id===kurs.id)
      const preis=isFrueh?kurs.fruehbucher_preis:kurs.spaetbucher_preis
      return{kurs,buchung:existingB??null,preis:existingB?existingB.gebuchter_preis:preis,selected:!!existingB&&existingB.zahlungsstatus!=='storniert'}
    })
    setNeueRechModal({group:savedGroup,items})
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

  async function bestaetigeNeueRechnung(){
    if(!neueRechModal||!k)return
    setSaving(true)
    const selected=neueRechModal.items.filter(i=>i.selected)
    for(const item of selected){
      if(item.buchung){
        await supabase.from('buchungen').update({zahlungsstatus:'ausstehend',rechnungsnummer:null,rechnung_versendet_am:null,gebuchter_preis:item.preis}).eq('id',item.buchung.id)
      } else {
        await supabase.from('buchungen').insert({teilnehmer_id:neueRechModal.group.tnId,kurs_id:item.kurs.id,gebuchter_preis:item.preis,zahlungsstatus:'ausstehend',kongress_id:k.id,gebucht_am:new Date().toISOString()})
      }
    }
    setNeueRechModal(null)
    await load(k.id);setSaving(false)
  }

  return(
    <div>
      <PageHeader title="Rechnungen" sub="Sammelrechnungen & Stornos"/>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {groups.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Keine Buchungen vorhanden</div>}
            {groups.map((g,gi)=>{
              const isOpen=expanded===g.tnId
              const ohneRech=g.buchungen.filter(b=>!b.rechnungsnummer&&b.zahlungsstatus==='bezahlt')
              const hatAusstehend=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              const alleRechNr=Array.from(new Set(g.buchungen.map(b=>b.rechnungsnummer).filter(Boolean)))
              // Group by rechnungsnummer
              const rechMap:Record<string,Buchung[]>={}
              g.buchungen.filter(b=>b.rechnungsnummer).forEach(b=>{
                const k=b.rechnungsnummer!
                if(!rechMap[k])rechMap[k]=[]
                rechMap[k].push(b)
              })
              return(
                <div key={g.tnId} className={gi>0?'border-t border-gray-100':''}>
                  <div className={`flex items-center gap-4 px-4 py-3.5 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>setExpanded(isOpen?null:g.tnId)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>{isOpen?'−':'+'}</div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm">{g.tn.nachname} {g.tn.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{g.tn.email}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {alleRechNr.map(nr=><span key={nr} className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{nr}</span>)}
                      {ohneRech.length>0&&<Badge label="Ohne Rechnung" variant="yellow"/>}
                      {hatAusstehend&&<Badge label="Ausstehend" variant="yellow"/>}
                    </div>
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4 space-y-3">
                      {hatAusstehend&&(
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Zahlung ausstehend</p>
                            <p className="text-xs text-amber-600">€ {g.buchungen.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)} offen</p>
                          </div>
                          <Btn size="sm" variant="outline" disabled={erinnerungSending===g.tnId} onClick={()=>sendZahlungserinnerung(g)}>
                            {erinnerungSending===g.tnId?'Sendet…':'📧 Zahlungserinnerung'}
                          </Btn>
                        </div>
                      )}

                      {/* Sammelrechnung erstellen */}
                      {ohneRech.length>0&&(
                        <div className="border border-amber-200 rounded-xl overflow-hidden">
                          <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
                            <div>
                              <span className="text-sm font-bold text-amber-700">⚡ Sammelrechnung</span>
                              <span className="text-xs text-amber-600 ml-2">{ohneRech.length} Kurs{ohneRech.length!==1?'e':''} · € {ohneRech.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                            </div>
                            <Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating({group:g,buchungen:ohneRech})}}>📄 Rechnung erstellen</Btn>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {ohneRech.map(b=>(
                              <div key={b.id} className="flex items-center justify-between px-4 py-2.5 bg-white">
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-medium">{b.kurse.titel}</span>
                                  <Badge label="Bezahlt" variant="green"/>
                                </div>
                                <span className="text-sm font-bold">€ {b.gebuchter_preis.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bestehende Rechnungen */}
                      {Object.entries(rechMap).map(([nr,buchungen])=>{
                        const isStorno=nr.includes('-Storno')
                        const bezahlt=buchungen.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt')&&buchungen.some(b=>b.zahlungsstatus==='bezahlt')
                        const versendet=buchungen.find(b=>b.rechnung_versendet_am)?.rechnung_versendet_am??null
                        return(
                          <div key={nr} className={`border rounded-xl overflow-hidden ${isStorno?'border-red-100':'border-gray-200'}`}>
                            <div className={`px-4 py-3 flex items-center justify-between ${isStorno?'bg-red-50':'bg-gray-50'}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-mono text-sm font-bold ${isStorno?'text-red-700':'text-gray-700'}`}>{isStorno?'🔴':'📄'} {nr}</span>
                                {bezahlt&&!isStorno&&<Badge label="Bezahlt" variant="green"/>}
                                {isStorno&&<Badge label="Stornorechnung" variant="red"/>}
                                {versendet&&<span className="text-[10px] text-gray-400">📧 {new Date(versendet).toLocaleDateString('de-AT')}</span>}
                                <span className="text-xs text-gray-500 font-semibold">€ {buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                <Btn size="sm" variant="outline" onClick={()=>{
                                  const html=isStorno
                                    ?'<p>Stornorechnung wird aus Storage geladen...</p>'
                                    :buildHtml(g,nr,buchungen,'Damen und Herren',bezahlt)
                                  if(isStorno){
                                    supabase.storage.from('rechnungen').download(`${k!.jahr}/${g.tn.nachname}_${g.tn.vorname}_${nr}.html`).then(({data})=>{
                                      if(data)data.text().then(t=>{setPreviewHtml(t);setPreviewNr(nr);setPreviewMode('existing')})
                                    })
                                  } else {
                                    setPreviewHtml(html);setPreviewNr(nr);setPreviewMode('existing')
                                  }
                                }}>👁 Anzeigen</Btn>
                                {(bezahlt||isStorno)&&(
                                  <Btn size="sm" variant="outline" disabled={sending===nr} onClick={async()=>{
                                    const html=buildHtml(g,nr,buchungen,'Damen und Herren',bezahlt)
                                    await sendEmail(g,nr,html)
                                  }}>
                                    {sending===nr?'Sendet…':versendet?'📧 Erneut':'📧 Senden'}
                                  </Btn>
                                )}
                                {!bezahlt&&!isStorno&&<span className="text-[10px] text-gray-400 italic">Erst nach Zahlung senden</span>}
                                {bezahlt&&!isStorno&&(
                                  <Btn size="sm" variant="danger" onClick={()=>{
                                    if(!k)return
                                    const bezBuch=buchungen.filter(b=>b.zahlungsstatus==='bezahlt')
                                    const betrag=bezBuch.reduce((s,b)=>s+b.gebuchter_preis,0)
                                    const calc=calcStornoErstattung(betrag,k)
                                    setStornoGroup(g);setStornoRechNr(nr);setStornoCalc(calc)
                                    const sHtml=buildStornoHtml(g,`${nr}-Storno`,nr,bezBuch,calc.erstattung,calc.einbehalt,calc.typ)
                                    setPreviewHtml(sHtml);setPreviewNr(`${nr}-Storno`);setPreviewMode('storno')
                                  }}>🔴 Stornieren</Btn>
                                )}
                                {isStorno&&<Btn size="sm" onClick={()=>{
                                  const isFrueh=k&&new Date()<=new Date(k.fruehbucher_bis)
                                  const items=alleKurse.filter(kk=>!kk.ist_pflichtprogramm).map(kurs=>{
                                    const existingB=g.buchungen.find(b=>b.kurs_id===kurs.id)
                                    const preis=isFrueh?kurs.fruehbucher_preis:kurs.spaetbucher_preis
                                    return{kurs,buchung:existingB??null,preis:existingB?existingB.gebuchter_preis:preis,selected:false}
                                  })
                                  setNeueRechModal({group:g,items})
                                }}>📄 Neue Rechnung</Btn>}
                              </div>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {buchungen.map(b=>(
                                <div key={b.id} className={`flex items-center justify-between px-4 py-2.5 ${b.zahlungsstatus==='storniert'?'bg-red-50':'bg-white'}`}>
                                  <div className="flex items-center gap-3">
                                    <span className={`text-sm font-medium ${b.zahlungsstatus==='storniert'?'line-through text-gray-400':''}`}>{b.kurse.titel}</span>
                                    <Badge label={b.zahlungsstatus==='bezahlt'?'Bezahlt':b.zahlungsstatus==='storniert'?'Storniert':'Ausstehend'} variant={b.zahlungsstatus==='bezahlt'?'green':b.zahlungsstatus==='storniert'?'red':'yellow'}/>
                                  </div>
                                  <span className="text-sm font-bold">€ {b.gebuchter_preis.toFixed(2)}</span>
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
        <Modal title={`Sammelrechnung — ${creating.group.tn.nachname} ${creating.group.tn.vorname}`} onClose={()=>setCreating(null)}>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Anrede</p>
              <div className="flex gap-2">
                {['Damen und Herren','Frau','Herr'].map(a=>(
                  <button key={a} onClick={()=>setAnrede(a)} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600'}`}>{a}</button>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              {creating.buchungen.map(b=>(
                <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                  <span>{b.kurse.titel}</span><span className="font-semibold">€ {b.gebuchter_preis.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold mt-2 pt-2 border-t text-sm">
                <span>Gesamt inkl. 20% MwSt.</span>
                <span>€ {creating.buchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Btn variant="outline" onClick={()=>setCreating(null)}>Abbrechen</Btn>
              <Btn onClick={async()=>{
                if(!k||!creating)return
                const existing=await getAlleRechnungsnummern(k.id)
                const nr=nextRechnungsnr(existing,k.jahr)
                const anredeText=anrede==='Damen und Herren'?'Damen und Herren':`${anrede} ${creating.group.tn.nachname}`
                setPreviewNr(nr)
                setPreviewHtml(buildHtml(creating.group,nr,creating.buchungen,anredeText,true))
                setPreviewMode('new')
              }}>Vorschau →</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* NEUE RECHNUNG NACH STORNO */}
      {neueRechModal&&(
        <Modal title={`Neue Buchung — ${neueRechModal.group.tn.nachname} ${neueRechModal.group.tn.vorname}`} onClose={()=>setNeueRechModal(null)} wide scroll>
          <p className="text-sm text-gray-500 mb-4">Wähle die Kurse für die neue Rechnung. Preise sind anpassbar.</p>
          <div className="space-y-2 mb-4">
            {neueRechModal.items.map((item,idx)=>(
              <div key={item.kurs.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.selected?'border-[#FFBF00] bg-amber-50':'border-gray-200'}`}>
                <input type="checkbox" checked={item.selected} onChange={e=>{
                  const next=[...neueRechModal.items]
                  next[idx]={...next[idx],selected:e.target.checked}
                  setNeueRechModal({...neueRechModal,items:next})
                }} className="accent-amber-500 w-4 h-4 flex-shrink-0"/>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{item.kurs.titel}
                    {item.buchung?.zahlungsstatus==='storniert'&&<span className="ml-2 text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">STORNIERT</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">€</span>
                  <input type="number" value={item.preis} step="0.01" min="0" onChange={e=>{
                    const next=[...neueRechModal.items]
                    next[idx]={...next[idx],preis:parseFloat(e.target.value)||0}
                    setNeueRechModal({...neueRechModal,items:next})
                  }} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-[#FFBF00]"/>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-bold text-sm mb-4 pt-3 border-t">
            <span>Gesamt</span>
            <span>€ {neueRechModal.items.filter(i=>i.selected).reduce((s,i)=>s+i.preis,0).toFixed(2)}</span>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setNeueRechModal(null)}>Überspringen</Btn>
            <Btn disabled={saving||!neueRechModal.items.some(i=>i.selected)} onClick={bestaetigeNeueRechnung}>
              {saving?'Speichert…':'✓ Neue Buchungen anlegen'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* VORSCHAU */}
      {previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className={`flex items-center justify-between px-6 py-4 border-b ${previewMode==='storno'?'bg-red-50':''}`}>
              <div>
                <h2 className={`font-bold text-base ${previewMode==='storno'?'text-red-700':''}`}>
                  {previewMode==='storno'?'🔴 Stornorechnung':'📄 Rechnung'} — {previewNr}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{previewMode==='new'?'Bitte prüfen vor dem Speichern':previewMode==='storno'?'Stornorechnung prüfen':'Gespeicherte Rechnung'}</p>
              </div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreviewHtml(null);if(previewMode==='new')setCreating(null);if(previewMode==='storno'){setStornoGroup(null);setStornoRechNr(null);setStornoCalc(null)}}}>← Schließen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(previewHtml!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>
                {previewMode==='new'&&creating&&<Btn onClick={saveRechnung} disabled={saving}>{saving?'Speichert…':'✓ Speichern'}</Btn>}
                {previewMode==='storno'&&stornoGroup&&stornoCalc&&<Btn variant="danger" onClick={saveStorno} disabled={saving}>{saving?'Speichert…':'✓ Stornorechnung speichern'}</Btn>}
                {previewMode==='existing'&&(()=>{
                  const grp=groups.find(g=>g.buchungen.some(b=>b.rechnungsnummer===previewNr))
                  if(!grp)return null
                  return<Btn variant="outline" disabled={sending===previewNr} onClick={async()=>{if(previewHtml)await sendEmail(grp,previewNr,previewHtml)}}>{sending===previewNr?'Sendet…':'📧 Senden'}</Btn>
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

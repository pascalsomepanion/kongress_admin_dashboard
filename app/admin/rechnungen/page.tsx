'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,getAlleRechnungsnummern,nextRechnungsnr,type Kongress,type Kurs}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;gebucht_am:string;teilnehmer_id:number;kurse:{titel:string;fruehbucher_preis:number;spaetbucher_preis:number;mitglied_fruehbucher_preis:number|null;mitglied_spaetbucher_preis:number|null}}
type TN={id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean}
type TGroup={tnId:number;tn:TN;buchungen:Buchung[]}
type RechGruppe={rNr:string|null;buchungen:Buchung[];bezahlt:boolean;hasOffen:boolean;versendetAm:string|null;isStorno:boolean}

function stornoErstattung(betrag:number,k:Kongress):{erstattung:number;einbehalt:number;typ:'kostenlos'|'50prozent'|'keine'}{
  const h=new Date()
  if(h<=new Date(k.storno_kostenlos_bis))return{erstattung:betrag,einbehalt:0,typ:'kostenlos'}
  if(h<=new Date(k.storno_50_bis))return{erstattung:Math.round(betrag*50)/100,einbehalt:Math.round(betrag*50)/100,typ:'50prozent'}
  return{erstattung:0,einbehalt:betrag,typ:'keine'}
}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[alleKurse,setAlleKurse]=useState<Kurs[]>([])
  const[groups,setGroups]=useState<TGroup[]>([])
  const[loading,setLoading]=useState(true)
  const[expanded,setExpanded]=useState<number|null>(null)
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<string|null>(null)
  const[erinnerungSending,setErinnerungSending]=useState<number|null>(null)
  // Preview
  const[previewHtml,setPreviewHtml]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[previewMode,setPreviewMode]=useState<'new'|'storno'|'existing'>('new')
  // Rechnung erstellen
  const[creating,setCreating]=useState<{group:TGroup;buchungen:Buchung[]}|null>(null)
  const[anrede,setAnrede]=useState('Damen und Herren')
  // Storno Modal
  const[stornoModal,setStornoModal]=useState<{group:TGroup;rNr:string;buchungen:Buchung[];calc:{erstattung:number;einbehalt:number;typ:string}}|null>(null)
  const[stornoHtml,setStornoHtml]=useState<string|null>(null)
  const[stornoNr,setStornoNr]=useState('')
  // Neue Rechnung nach Storno
  const[neueRechModal,setNeueRechModal]=useState<{group:TGroup;items:{kurs:Kurs|null;buchung:Buchung|null;titel:string;preis:number;selected:boolean;kursId:number}[]}|null>(null)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[,kk]=await Promise.all([load(k.id),getKurse(k.id)])
    setAlleKurse(kk)
    setLoading(false)
  })},[])

  async function load(kid:number){
    const{data}=await supabase.from('buchungen')
      .select('id,kurs_id,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,gebucht_am,teilnehmer_id,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel,fruehbucher_preis,spaetbucher_preis,mitglied_fruehbucher_preis,mitglied_spaetbucher_preis)')
      .eq('kongress_id',kid).gt('gebuchter_preis',0).order('gebucht_am',{ascending:false})
    const map:Record<number,TGroup>={}
    ;(data??[]).forEach((x:any)=>{
      const tid=x.teilnehmer_id
      if(!map[tid])map[tid]={tnId:tid,tn:x.teilnehmer,buchungen:[]}
      map[tid].buchungen.push({...x,kurse:x.kurse})
    })
    setGroups(Object.values(map).sort((a,b)=>a.tn.nachname.localeCompare(b.tn.nachname)))
  }

  function getHistorie(buchungen:Buchung[]):RechGruppe[]{
    const map:Record<string,Buchung[]>={}
    buchungen.forEach(b=>{const key=b.rechnungsnummer??'__ohne__';if(!map[key])map[key]=[];map[key].push(b)})
    return Object.entries(map).map(([key,bs])=>({
      rNr:key==='__ohne__'?null:key,
      buchungen:bs,
      bezahlt:bs.some(b=>b.zahlungsstatus==='bezahlt')&&bs.filter(b=>b.zahlungsstatus!=='storniert').every(b=>b.zahlungsstatus==='bezahlt'),
      hasOffen:bs.some(b=>b.zahlungsstatus==='ausstehend'),
      versendetAm:bs.find(b=>b.rechnung_versendet_am)?.rechnung_versendet_am??null,
      isStorno:key!=='__ohne__'&&key.includes('-Storno'),
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
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm">
  <div><div style="font-size:10px;font-weight:700;color:#555">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div style="font-size:10px;color:#777">Österreichische Gesellschaft für Sportmedizin</div></div>
  <img src="/logo.svg" style="height:18mm;width:auto" onerror="this.style.display='none'"/>
</div>
<div style="margin-bottom:6mm;font-size:10px;line-height:1.8">
  <div style="font-weight:bold">${g.tn.vorname} ${g.tn.nachname}</div>
  <div>${g.tn.strasse} ${g.tn.hausnummer} · ${g.tn.postleitzahl} ${g.tn.stadt}</div>
  <div style="color:#555">ÖÄK Nr.: ${g.tn.oeak_nr}</div>
</div>
<div style="margin-bottom:4mm">
  <div style="font-size:15px;font-weight:bold;color:#dc2626">Stornorechnung / Gutschrift</div>
  <div style="font-size:10px;color:#555;margin-top:2px">Stornorechnung Nr.: <strong>${sNr}</strong> · zur Rechnung ${origNr} · ${heute}</div>
</div>
<div style="font-size:10px;line-height:1.7;margin-bottom:5mm"><p>Sehr geehrte Damen und Herren,</p><br><p>wir stornieren Ihre Rechnung ${origNr} vollständig. ${stornoText}</p></div>
<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm">
<thead><tr style="background:#f0f0f0"><th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th><th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:18%">Betrag</th></tr></thead>
<tbody>${rows}</tbody></table>
<div style="display:flex;justify-content:flex-end;margin-bottom:5mm"><table style="width:260px">
  ${typ==='50prozent'?`<tr><td style="font-size:10px;padding:3px 0;color:#555">Gesamtbetrag</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${brutto.toFixed(2)}</td></tr><tr><td style="font-size:10px;padding:3px 0;color:#dc2626">Stornogebühr 50%</td><td style="text-align:right;font-size:10px;padding:3px 0;color:#dc2626">+€ ${einbehalt.toFixed(2)}</td></tr>`:''}
  ${erstattung>0?`<tr><td style="font-size:10px;padding:3px 0;color:#555">Nettobetrag</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${netto.toFixed(2)}</td></tr><tr><td style="font-size:10px;padding:3px 0;color:#555">Ust. 20% inkl.</td><td style="text-align:right;font-size:10px;padding:3px 0">−€ ${mwst.toFixed(2)}</td></tr>`:''}
  <tr style="border-top:2px solid #dc2626"><td style="font-weight:bold;font-size:12px;padding:5px 0;color:#dc2626">${erstattung>0?'Rückerstattung':'Kein Erstattungsbetrag'}</td><td style="text-align:right;font-weight:bold;font-size:13px;padding:5px 0;color:#dc2626">${erstattung>0?`−€ ${erstattung.toFixed(2)}`:'€ 0.00'}</td></tr>
</table></div>
${erstattung>0?`<p style="font-size:10px;color:#555;margin-bottom:8mm">EUR ${erstattung.toFixed(2)} wird auf Ihr Konto zurücküberwiesen.</p>`:`<p style="font-size:10px;font-weight:bold;color:#dc2626;margin-bottom:8mm">Gemäß AGB erfolgt keine Rückerstattung.</p>`}
<div style="margin-top:10mm;font-size:10px;line-height:1.9"><p>Mit sportlichen Grüßen</p><br><br><p style="font-weight:bold;font-style:italic">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p><p style="color:#555">Kongresspräsident</p></div>
<div style="position:fixed;bottom:10mm;left:20mm;right:20mm;padding-top:4mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;font-size:8px;color:#555">
<div><div style="font-weight:bold;margin-bottom:2px">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</div><div>Michaelsgasse 20, 9900 Lienz · UID: ATU 61957546</div></div>
<div><div style="font-weight:bold;margin-bottom:2px">Bank</div><div>IBAN: AT67 1912 0500 9922 3610 · BIC: SPBAATWW</div></div>
<div style="text-align:right"><div style="font-weight:bold;margin-bottom:2px">Kontakt</div><div>Tel.: 04852 61952-52 · info@sportmedizin-arlberg.at</div></div>
</div></body></html>`
  }

  async function saveRechnung(){
    if(!creating||!k||!previewNr||!previewHtml)return
    setSaving(true)
    const tn=creating.group.tn
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`,new Blob([previewHtml],{type:'text/html'}),{upsert:true})
    const ids=creating.buchungen.map(b=>b.id)
    await supabase.from('buchungen').update({rechnungsnummer:previewNr}).in('id',ids)
    const brutto=creating.buchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:creating.group.tnId,rechnungsnummer:previewNr,typ:'teilnehmer',anrede,gesamtbetrag_brutto:brutto,netto:brutto/1.2,mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,bezahlt:true,erstellt_am:new Date().toISOString()})
    setPreviewHtml(null);setCreating(null)
    await load(k.id);setSaving(false)
  }

  async function saveStorno(){
    if(!stornoModal||!k||!stornoHtml||!stornoNr)return
    setSaving(true)
    const{group,rNr,buchungen,calc}=stornoModal
    const tn=group.tn
    // Save storno PDF
    await supabase.storage.from('rechnungen').upload(`${k.jahr}/${tn.nachname}_${tn.vorname}_${stornoNr}.html`,new Blob([stornoHtml],{type:'text/html'}),{upsert:true})
    // Mark all buchungen of this invoice as storniert
    for(const b of buchungen){await supabase.from('buchungen').update({zahlungsstatus:'storniert'}).eq('id',b.id)}
    // Save in rechnungen table
    const e=calc.erstattung
    await supabase.from('rechnungen').insert({kongress_id:k.id,teilnehmer_id:group.tnId,rechnungsnummer:stornoNr,typ:'storno',anrede:'Damen und Herren',gesamtbetrag_brutto:-e,netto:-e/1.2,mwst_betrag:-(e-(e/1.2)),mwst_prozent:20,bezahlt:false,erstellt_am:new Date().toISOString()})
    // Prepare neue rechnung modal
    const isFrueh=new Date()<=new Date(k.fruehbucher_bis)
    const gebuchtKursIds=new Set(group.buchungen.map(b=>b.kurs_id))
    const nichtPflichtKurse=alleKurse.filter(kk=>!kk.ist_pflichtprogramm)
    const items=nichtPflichtKurse.map(kurs=>{
      const existingB=buchungen.find(b=>b.kurs_id===kurs.id)
      const preis=isFrueh?(kurs.fruehbucher_preis):(kurs.spaetbucher_preis)
      return{
        kurs,buchung:existingB??null,
        titel:kurs.titel,
        preis:existingB?existingB.gebuchter_preis:preis,
        selected:!!existingB&&existingB.zahlungsstatus!=='storniert',
        kursId:kurs.id,
      }
    })
    const savedGroup={...group}
    setStornoModal(null);setStornoHtml(null);setStornoNr('')
    await load(k.id);setSaving(false)
    // Open neue rechnung modal
    setNeueRechModal({group:savedGroup,items})
  }

  async function bestaetigeNeueRechnung(){
    if(!neueRechModal||!k)return
    setSaving(true)
    const selected=neueRechModal.items.filter(i=>i.selected)
    // For each selected item: if existing buchung → reset, if new → insert
    for(const item of selected){
      if(item.buchung){
        await supabase.from('buchungen').update({zahlungsstatus:'ausstehend',rechnungsnummer:null,rechnung_versendet_am:null,gebuchter_preis:item.preis}).eq('id',item.buchung.id)
      } else {
        await supabase.from('buchungen').insert({teilnehmer_id:neueRechModal.group.tnId,kurs_id:item.kursId,gebuchter_preis:item.preis,zahlungsstatus:'ausstehend',kongress_id:k.id,gebucht_am:new Date().toISOString()})
      }
    }
    setNeueRechModal(null)
    await load(k.id);setSaving(false)
  }

  async function sendEmail(g:TGroup,nr:string,html:string){
    if(!k)return
    setSending(nr)
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:g.tn.email,vorname:g.tn.vorname,nachname:g.tn.nachname,rechnungsnummer:nr,html,kongress_name:k.name})})
    const buchungen=g.buchungen.filter(b=>b.rechnungsnummer===nr)
    for(const b of buchungen){await supabase.from('buchungen').update({rechnung_versendet_am:new Date().toISOString()}).eq('id',b.id)}
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

  return(
    <div>
      <PageHeader title="Rechnungen" sub="Sammelrechnungen & Stornos"/>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {groups.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Keine Buchungen vorhanden</div>}
            {groups.map((g,gi)=>{
              const isOpen=expanded===g.tnId
              const historie=getHistorie(g.buchungen)
              const hatOhne=g.buchungen.some(b=>!b.rechnungsnummer&&(b.zahlungsstatus==='bezahlt'))
              const ohneRechBuchungen=g.buchungen.filter(b=>!b.rechnungsnummer&&b.zahlungsstatus==='bezahlt')
              const hatAusstehend=g.buchungen.some(b=>b.zahlungsstatus==='ausstehend')
              const alleRechNr=Array.from(new Set(g.buchungen.map(b=>b.rechnungsnummer).filter(Boolean)))
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
                      {hatOhne&&<Badge label="Ohne Rechnung" variant="yellow"/>}
                      {hatAusstehend&&<Badge label="Ausstehend" variant="yellow"/>}
                    </div>
                  </div>

                  {isOpen&&(
                    <div className="bg-[#FFFDF5] border-t border-[#FFE082]/50 px-6 py-4 space-y-3">
                      {/* Zahlungserinnerung */}
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

                      {/* Sammelrechnung erstellen — alle bezahlten ohne Rechnungsnummer */}
                      {hatOhne&&(
                        <div className="border border-amber-200 rounded-xl overflow-hidden">
                          <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
                            <div>
                              <span className="text-sm font-bold text-amber-700">⚡ Sammelrechnung erstellen</span>
                              <span className="text-xs text-amber-600 ml-2">{ohneRechBuchungen.length} Kurs{ohneRechBuchungen.length!==1?'e':''} · € {ohneRechBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                            </div>
                            <Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating({group:g,buchungen:ohneRechBuchungen})}}>
                              📄 Rechnung erstellen
                            </Btn>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {ohneRechBuchungen.map(b=>(
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

                      {/* Rechnungshistorie */}
                      {historie.filter(h=>h.rNr!==null).map((h,hi)=>{
                        const isStornoRech=h.isStorno
                        return(
                          <div key={hi} className={`border rounded-xl overflow-hidden ${isStornoRech?'border-red-100':'border-gray-200'}`}>
                            <div className={`px-4 py-3 flex items-center justify-between ${isStornoRech?'bg-red-50':'bg-gray-50'}`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`font-mono text-sm font-bold ${isStornoRech?'text-red-700':'text-gray-700'}`}>
                                  {isStornoRech?'🔴':'📄'} {h.rNr}
                                </span>
                                {h.bezahlt&&!isStornoRech&&<Badge label="Bezahlt" variant="green"/>}
                                {h.hasOffen&&<Badge label="Ausstehend" variant="yellow"/>}
                                {isStornoRech&&<Badge label="Stornorechnung" variant="red"/>}
                                {h.versendetAm&&<span className="text-[10px] text-gray-400">📧 {new Date(h.versendetAm).toLocaleDateString('de-AT')}</span>}
                                {!isStornoRech&&<span className="text-xs text-gray-500 font-semibold">€ {h.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>}
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                {/* Anzeigen */}
                                <Btn size="sm" variant="outline" onClick={async()=>{
                                  if(isStornoRech){
                                    const{data}=await supabase.storage.from('rechnungen').download(`${k!.jahr}/${g.tn.nachname}_${g.tn.vorname}_${h.rNr}.html`)
                                    if(data){setPreviewHtml(await data.text());setPreviewNr(h.rNr!);setPreviewMode('existing')}
                                  } else {
                                    const html=buildHtml(g,h.rNr!,h.buchungen,'Damen und Herren',h.bezahlt)
                                    setPreviewHtml(html);setPreviewNr(h.rNr!);setPreviewMode('existing')
                                  }
                                }}>👁 Anzeigen</Btn>
                                {/* Senden */}
                                {(h.bezahlt||isStornoRech)&&(
                                  <Btn size="sm" variant="outline" disabled={sending===h.rNr} onClick={async()=>{
                                    let html:string
                                    if(isStornoRech){
                                      const{data}=await supabase.storage.from('rechnungen').download(`${k!.jahr}/${g.tn.nachname}_${g.tn.vorname}_${h.rNr}.html`)
                                      if(!data)return;html=await data.text()
                                    } else {
                                      html=buildHtml(g,h.rNr!,h.buchungen,'Damen und Herren',h.bezahlt)
                                    }
                                    await sendEmail(g,h.rNr!,html)
                                  }}>
                                    {sending===h.rNr?'Sendet…':h.versendetAm?'📧 Erneut':'📧 Senden'}
                                  </Btn>
                                )}
                                {!h.bezahlt&&!isStornoRech&&<span className="text-[10px] text-gray-400 italic">Erst nach Zahlung senden</span>}
                                {/* Stornieren — nur bezahlte normale Rechnungen */}
                                {h.bezahlt&&!isStornoRech&&h.buchungen.filter(b=>b.zahlungsstatus==='bezahlt').length>0&&(
                                  <Btn size="sm" variant="danger" onClick={async()=>{
                                    if(!k)return
                                    const bezBuchungen=h.buchungen.filter(b=>b.zahlungsstatus==='bezahlt')
                                    const betrag=bezBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
                                    const calc=stornoErstattung(betrag,k)
                                    const existing=await getAlleRechnungsnummern(k.id)
                                    const sNr=`${h.rNr}-Storno`
                                    const sHtml=buildStornoHtml(g,sNr,h.rNr!,bezBuchungen,calc.erstattung,calc.einbehalt,calc.typ)
                                    setStornoModal({group:g,rNr:h.rNr!,buchungen:bezBuchungen,calc})
                                    setStornoHtml(sHtml);setStornoNr(sNr)
                                  }}>🔴 Stornieren</Btn>
                                )}
                              </div>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {h.buchungen.map(b=>(
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
                  <button key={a} onClick={()=>setAnrede(a)} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{a}</button>
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
                setPreviewNr(nr);setPreviewHtml(buildHtml(creating.group,nr,creating.buchungen,anredeText,true));setPreviewMode('new')
              }}>Vorschau →</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* STORNO BESTÄTIGEN + VORSCHAU */}
      {stornoModal&&stornoHtml&&!previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50">
              <div>
                <h2 className="font-bold text-base text-red-700">🔴 Stornorechnung — {stornoNr}</h2>
                <p className="text-xs text-red-500 mt-0.5">Bitte prüfen — nach dem Speichern werden alle Kurse storniert</p>
              </div>
              <div className="flex gap-3 items-center">
                {/* Stornogebühr Info */}
                <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${stornoModal.calc.typ==='kostenlos'?'bg-green-100 text-green-700':stornoModal.calc.typ==='50prozent'?'bg-amber-100 text-amber-700':'bg-red-100 text-red-700'}`}>
                  {stornoModal.calc.typ==='kostenlos'?`Volle Erstattung € ${stornoModal.calc.erstattung.toFixed(2)}`:stornoModal.calc.typ==='50prozent'?`50% Erstattung € ${stornoModal.calc.erstattung.toFixed(2)}`:'Keine Erstattung'}
                </div>
                <Btn variant="outline" onClick={()=>{setStornoModal(null);setStornoHtml(null);setStornoNr('')}}>← Abbrechen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(stornoHtml!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>
                <Btn variant="danger" onClick={saveStorno} disabled={saving}>{saving?'Speichert…':'✓ Stornorechnung speichern'}</Btn>
              </div>
            </div>
            <iframe srcDoc={stornoHtml} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}

      {/* NEUE RECHNUNG NACH STORNO */}
      {neueRechModal&&(
        <Modal title={`Neue Buchung nach Storno — ${neueRechModal.group.tn.nachname} ${neueRechModal.group.tn.vorname}`} onClose={()=>setNeueRechModal(null)} wide scroll>
          <p className="text-sm text-gray-500 mb-4">Wähle welche Kurse der Teilnehmer neu buchen soll. Stornierte Kurse können wieder aufgenommen werden. Preise sind anpassbar.</p>
          <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
            {neueRechModal.items.map((item,idx)=>(
              <div key={item.kursId} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${item.selected?'border-[#FFBF00] bg-amber-50':'border-gray-200'}`}>
                <input type="checkbox" checked={item.selected} onChange={e=>{
                  const next=[...neueRechModal.items]
                  next[idx]={...next[idx],selected:e.target.checked}
                  setNeueRechModal({...neueRechModal,items:next})
                }} className="accent-amber-500 w-4 h-4 flex-shrink-0"/>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.titel}
                    {item.buchung?.zahlungsstatus==='storniert'&&<span className="ml-2 text-[10px] text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded">STORNIERT</span>}
                    {!item.buchung&&<span className="ml-2 text-[10px] text-blue-500 font-bold bg-blue-50 px-1.5 py-0.5 rounded">NEU</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
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
          <div className="flex justify-between items-center font-bold text-sm mb-4 pt-3 border-t">
            <span>Neue Buchungen gesamt</span>
            <span>€ {neueRechModal.items.filter(i=>i.selected).reduce((s,i)=>s+i.preis,0).toFixed(2)}</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">Die ausgewählten Kurse werden auf "ausstehend" gesetzt. Sobald die neue Zahlung eingeht, kannst du eine neue Rechnung erstellen.</p>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setNeueRechModal(null)}>Überspringen</Btn>
            <Btn disabled={saving||!neueRechModal.items.some(i=>i.selected)} onClick={bestaetigeNeueRechnung}>
              {saving?'Speichert…':'✓ Neue Buchungen anlegen'}
            </Btn>
          </div>
        </Modal>
      )}

      {/* VORSCHAU MODAL */}
      {previewHtml&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-bold text-base">📄 {previewMode==='new'?'Neue Rechnung':'Rechnung'} — {previewNr}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{previewMode==='new'?'Bitte prüfen vor dem Speichern':'Gespeicherte Rechnung'}</p>
              </div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreviewHtml(null);if(previewMode==='new')setCreating(null)}}>← Schließen</Btn>
                <Btn onClick={()=>{const win=window.open('','_blank');if(win){win.document.write(previewHtml!);win.document.close();setTimeout(()=>win.print(),600)}}}>🖨 Drucken</Btn>
                {previewMode==='new'&&creating&&<Btn onClick={saveRechnung} disabled={saving}>{saving?'Speichert…':'✓ Speichern'}</Btn>}
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

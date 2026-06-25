'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getAlleRechnungsnummern,nextRechnungsnr,type Kongress}from'@/lib/db'
import{buildRechnungHTML}from'@/lib/pdf'
import{Btn,Badge,Loader,Modal,PageHeader,Table}from'@/lib/ui'

type Row={id:number;teilnehmer_id:number;gebucht_am:string;gebuchter_preis:number;zahlungsstatus:string;rechnungsnummer:string|null;rechnung_versendet_am:string|null;teilnehmer:{id:number;vorname:string;nachname:string;email:string;oeak_nr:string;strasse:string;hausnummer:string;postleitzahl:string;stadt:string;land:string;ist_oegsmp_mitglied:boolean};kurse:{titel:string}}
type TGroup={tnId:number;tn:Row['teilnehmer'];buchungen:Row[];rNr:string|null;versendet:string|null;allBezahlt:boolean;pdfUrl:string|null}

export default function RechnungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[rows,setRows]=useState<Row[]>([])
  const[loading,setLoading]=useState(true)
  const[creating,setCreating]=useState<TGroup|null>(null)
  const[anrede,setAnrede]=useState<'Damen und Herren'|'Frau'|'Herr'>('Damen und Herren')
  const[preview,setPreview]=useState<string|null>(null)
  const[previewNr,setPreviewNr]=useState('')
  const[saving,setSaving]=useState(false)
  const[sending,setSending]=useState<number|null>(null)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return};setK(k)
    const{data}=await supabase.from('buchungen').select('id,teilnehmer_id,gebucht_am,gebuchter_preis,zahlungsstatus,rechnungsnummer,rechnung_versendet_am,teilnehmer(id,vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied),kurse(titel)').eq('kongress_id',k.id).order('gebucht_am',{ascending:false})
    setRows((data as unknown as Row[])??[]);setLoading(false)
  })},[])

  const groups:TGroup[]=Object.values(
    rows.reduce((acc,r)=>{
      if(!acc[r.teilnehmer_id])acc[r.teilnehmer_id]={tnId:r.teilnehmer_id,tn:r.teilnehmer,buchungen:[],rNr:null,versendet:null,allBezahlt:false,pdfUrl:null}
      acc[r.teilnehmer_id].buchungen.push(r)
      if(r.rechnungsnummer)acc[r.teilnehmer_id].rNr=r.rechnungsnummer
      if(r.rechnung_versendet_am)acc[r.teilnehmer_id].versendet=r.rechnung_versendet_am
      return acc
    },{} as Record<number,TGroup>)
  ).map(g=>({...g,allBezahlt:g.buchungen.every(b=>b.zahlungsstatus==='bezahlt')}))

  async function createPreview(g:TGroup){
    if(!k)return
    const existing=await getAlleRechnungsnummern(k.id)
    const nr=nextRechnungsnr(existing,k.jahr)
    setPreviewNr(nr)
    const tn=g.tn
    const aktiveBuchungen=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const anredeText=anrede==='Damen und Herren'?'Damen und Herren':`${anrede} ${tn.nachname}`
    const html=buildRechnungHTML({
      rechnungsnummer:nr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:anredeText,empfaenger_name:`${tn.vorname} ${tn.nachname}`,
      empfaenger_strasse:`${tn.strasse} ${tn.hausnummer}`,
      empfaenger_plz_ort:`${tn.postleitzahl} ${tn.stadt}`,
      empfaenger_land:tn.land,empfaenger_kennung:`OeAK Nr.: ${tn.oeak_nr}`,
      positionen:aktiveBuchungen.map(b=>({bezeichnung:b.kurse.titel,menge:1,einzelpreis:b.gebuchter_preis})),
      mwst_typ:'mit_mwst',bezahlt:g.allBezahlt,kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`Vielen Dank fuer Ihr Interesse am Sportmedizin Kongress St. Christoph am Arlberg ${k.jahr}. Fuer die Teilnahme an den u.a. Kursen duerfen wir folgende Rechnung stellen:`,
    })
    setPreview(html);setCreating(g)
  }

  async function saveAndPrint(){
    if(!creating||!k||!previewNr||!preview)return
    setSaving(true)

    // 1. Druckdialog öffnen
    const win=window.open('','_blank')
    if(win){win.document.write(preview);win.document.close();setTimeout(()=>win.print(),600)}

    // 2. HTML als Blob in Supabase Storage speichern
    const tn=creating.tn
    const dateiname=`${k.jahr}/${tn.nachname}_${tn.vorname}_${previewNr}.html`
    const blob=new Blob([preview],{type:'text/html'})
    await supabase.storage.from('rechnungen').upload(dateiname, blob, {upsert:true})

    // 3. Rechnungsnummer auf Buchungen setzen
    for(const b of creating.buchungen){
      await supabase.from('buchungen').update({rechnungsnummer:previewNr}).eq('id',b.id)
    }

    // 4. In rechnungen Tabelle speichern
    const aktiveBuchungen=creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const brutto=aktiveBuchungen.reduce((s,b)=>s+b.gebuchter_preis,0)
    await supabase.from('rechnungen').insert({
      kongress_id:k.id,teilnehmer_id:creating.tnId,rechnungsnummer:previewNr,
      typ:'teilnehmer',anrede,
      gesamtbetrag_brutto:brutto,netto:brutto/1.2,mwst_betrag:brutto-(brutto/1.2),mwst_prozent:20,
      bezahlt:creating.allBezahlt,erstellt_am:new Date().toISOString(),
    })

    setRows(prev=>prev.map(r=>creating.buchungen.find(b=>b.id===r.id)?{...r,rechnungsnummer:previewNr}:r))
    setPreview(null);setCreating(null);setSaving(false)
  }

  async function downloadPdf(rNr:string, tn:Row['teilnehmer']){
    if(!k)return
    const dateiname=`${k.jahr}/${tn.nachname}_${tn.vorname}_${rNr}.html`
    const{data}=await supabase.storage.from('rechnungen').download(dateiname)
    if(!data){alert('Datei nicht gefunden. Bitte Rechnung neu erstellen.');return}
    const url=URL.createObjectURL(data)
    const win=window.open(url,'_blank')
    if(win){setTimeout(()=>win.print(),800)}
  }

  async function send(g:TGroup){
    if(!g.rNr||!k)return
    setSending(g.tnId)
    const tn=g.tn
    const aktiveBuchungen=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert')
    const html=buildRechnungHTML({
      rechnungsnummer:g.rNr,datum:new Date().toLocaleDateString('de-AT'),
      anrede:'Damen und Herren',empfaenger_name:`${tn.vorname} ${tn.nachname}`,
      empfaenger_strasse:`${tn.strasse} ${tn.hausnummer}`,
      empfaenger_plz_ort:`${tn.postleitzahl} ${tn.stadt}`,
      empfaenger_land:tn.land,empfaenger_kennung:`OeAK Nr.: ${tn.oeak_nr}`,
      positionen:aktiveBuchungen.map(b=>({bezeichnung:b.kurse.titel,menge:1,einzelpreis:b.gebuchter_preis})),
      mwst_typ:'mit_mwst',bezahlt:g.allBezahlt,kongress_name:k.name,kongress_jahr:k.jahr,
      intro_text:`Vielen Dank fuer Ihr Interesse am Sportmedizin Kongress ${k.jahr}.`,
    })
    await fetch('/api/send-rechnung',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:tn.email,vorname:tn.vorname,nachname:tn.nachname,rechnungsnummer:g.rNr,html,kongress_name:k.name})})
    for(const b of g.buchungen){await supabase.from('buchungen').update({rechnung_versendet_am:new Date().toISOString()}).eq('id',b.id)}
    setRows(prev=>prev.map(r=>g.buchungen.find(b=>b.id===r.id)?{...r,rechnung_versendet_am:new Date().toISOString()}:r))
    setSending(null)
  }

  return(
    <div>
      <PageHeader title="Rechnungen" sub="Teilnehmer-Rechnungen"/>
      <div className="p-6">
        {loading?<Loader/>:(
          <Table headers={['Teilnehmer','Kurse','Gesamt','Rechnung-Nr.','Zahlung','Versendet','Aktionen']} empty={groups.length===0}>
            {groups.map(g=>{
              const total=g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0)
              return(
                <tr key={g.tnId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold">{g.tn.nachname} {g.tn.vorname}</div><div className="text-xs text-gray-400">{g.tn.email}</div></td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{g.buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>b.kurse.titel).join(', ')}</td>
                  <td className="px-4 py-3 font-bold whitespace-nowrap">EUR {total.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{g.rNr??<span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3"><Badge label={g.allBezahlt?'Bezahlt':'Ausstehend'} variant={g.allBezahlt?'green':'yellow'}/></td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{g.versendet?new Date(g.versendet).toLocaleDateString('de-AT'):'—'}</td>
                  <td className="px-4 py-3"><div className="flex gap-1.5 flex-wrap">
                    {!g.rNr&&<Btn size="sm" onClick={()=>{setAnrede('Damen und Herren');setCreating(g)}}>Rechnung erstellen</Btn>}
                    {g.rNr&&<Btn size="sm" variant="outline" onClick={()=>{setAnrede('Damen und Herren');setCreating(g)}}>Neu erstellen</Btn>}
                    {g.rNr&&<Btn size="sm" variant="outline" onClick={()=>downloadPdf(g.rNr!,g.tn)}>⬇ PDF</Btn>}
                    {g.rNr&&<Btn size="sm" variant="outline" disabled={sending===g.tnId} onClick={()=>send(g)}>{sending===g.tnId?'Sendet…':'📧 Senden'}</Btn>}
                  </div></td>
                </tr>
              )
            })}
          </Table>
        )}
      </div>

      {creating&&!preview&&(
        <Modal title={`Rechnung — ${creating.tn.nachname} ${creating.tn.vorname}`} onClose={()=>setCreating(null)}>
          <div className="mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Anrede auf der Rechnung</p>
            <div className="flex gap-2 flex-wrap">
              {(['Damen und Herren','Frau','Herr'] as const).map(a=>(
                <button key={a} onClick={()=>setAnrede(a)} className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${anrede===a?'bg-[#FFBF00] border-[#FFBF00] text-black':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {a==='Damen und Herren'?'Sehr geehrte Damen und Herren':`Sehr geehrte${a==='Herr'?'r':''} ${a}`}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 mb-2">Gebuchte Kurse</p>
            {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').map(b=>(
              <div key={b.id} className="flex justify-between text-sm py-1.5 border-b border-gray-200 last:border-0">
                <span className="text-gray-700">{b.kurse.titel}</span>
                <span className="font-semibold">EUR {b.gebuchter_preis.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold mt-2 pt-2 border-t border-gray-200">
              <span>Gesamt (inkl. 20% MwSt.)</span>
              <span>EUR {creating.buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setCreating(null)}>Abbrechen</Btn>
            <Btn onClick={()=>createPreview(creating)}>Vorschau anzeigen →</Btn>
          </div>
        </Modal>
      )}

      {preview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div><h2 className="font-bold text-base">Vorschau — {previewNr}</h2><p className="text-xs text-gray-400 mt-0.5">Bitte überprüfen — PDF wird lokal gespeichert und in Supabase archiviert</p></div>
              <div className="flex gap-3">
                <Btn variant="outline" onClick={()=>{setPreview(null);setCreating(creating)}}>← Zurück</Btn>
                <Btn onClick={saveAndPrint} disabled={saving}>{saving?'Wird gespeichert…':'✓ Speichern & Drucken'}</Btn>
              </div>
            </div>
            <iframe srcDoc={preview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'75vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

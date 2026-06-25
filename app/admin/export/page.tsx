'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Loader,PageHeader}from'@/lib/ui'
function toCSV(rows:object[],filename:string){
  if(!rows.length)return
  const h=Object.keys(rows[0])
  const csv=[h.join(';'),...rows.map(r=>h.map(k=>{const v=(r as any)[k];return typeof v==='string'&&v.includes(';')?`"${v}"`:v??''}).join(';'))].join('\n')
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download=filename;a.click()
}
export default function ExportPage(){
  const[k,setK]=useState<Kongress|null>(null),[loading,setLoading]=useState(true)
  useEffect(()=>{getAktuellerKongress().then(k=>{setK(k);setLoading(false)})},[])
  async function exportTeilnehmer(){if(!k)return;const{data}=await supabase.from('teilnehmer').select('vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied,registriert_am').eq('kongress_id',k.id).order('nachname');toCSV(data??[],`Teilnehmer_${k.jahr}.csv`)}
  async function exportBuchungen(){if(!k)return;const{data}=await supabase.from('buchungen').select('id,gebucht_am,gebuchter_preis,zahlungsstatus,rechnungsnummer,zahlungs_eingang_am,teilnehmer(vorname,nachname,email,oeak_nr),kurse(titel)').eq('kongress_id',k.id).order('gebucht_am',{ascending:false});toCSV((data??[]).map((b:any)=>({ID:b.id,Datum:new Date(b.gebucht_am).toLocaleDateString('de-AT'),Nachname:b.teilnehmer?.nachname,Vorname:b.teilnehmer?.vorname,Email:b.teilnehmer?.email,OeAK:b.teilnehmer?.oeak_nr,Kurs:b.kurse?.titel,Preis:b.gebuchter_preis,Status:b.zahlungsstatus,Rechnungsnr:b.rechnungsnummer??'',Bezahlt:b.zahlungs_eingang_am?new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT'):''})),`Buchungen_${k.jahr}.csv`)}
  async function exportOffen(){if(!k)return;const{data}=await supabase.from('buchungen').select('gebuchter_preis,gebucht_am,teilnehmer(vorname,nachname,email),kurse(titel)').eq('kongress_id',k.id).eq('zahlungsstatus','ausstehend');toCSV((data??[]).map((b:any)=>({Nachname:b.teilnehmer?.nachname,Vorname:b.teilnehmer?.vorname,Email:b.teilnehmer?.email,Kurs:b.kurse?.titel,Preis:b.gebuchter_preis,Angemeldet:new Date(b.gebucht_am).toLocaleDateString('de-AT')})),`Offene_Zahlungen_${k.jahr}.csv`)}
  async function exportSponsoren(){if(!k)return;const{data}=await supabase.from('sponsoren').select('firmenname,ansprechperson,email,strasse,hausnummer,plz,ort,land,uid_nr').eq('kongress_id',k.id);toCSV(data??[],`Sponsoren_${k.jahr}.csv`)}
  async function exportSpRechnungen(){if(!k)return;const{data}=await supabase.from('sponsoren_rechnungen').select('rechnungsnummer,beschreibung,betrag_netto,betrag_brutto,mwst_typ,zahlungsstatus,erstellt_am,bezahlt_am,sponsoren(firmenname,email)').eq('kongress_id',k.id);toCSV((data??[]).map((r:any)=>({Nr:r.rechnungsnummer??'',Firma:r.sponsoren?.firmenname,Email:r.sponsoren?.email,Beschreibung:r.beschreibung,Netto:r.betrag_netto,Brutto:r.betrag_brutto,MwSt:r.mwst_typ,Status:r.zahlungsstatus,Erstellt:r.erstellt_am?new Date(r.erstellt_am).toLocaleDateString('de-AT'):'',Bezahlt:r.bezahlt_am?new Date(r.bezahlt_am).toLocaleDateString('de-AT'):''})),`Sponsoren_Rechnungen_${k.jahr}.csv`)}
  async function printAnwesenheit(){
    if(!k)return;const{data:kurse}=await supabase.from('kurse').select('id,titel,wochentag_datum').eq('kongress_id',k.id).order('sort_order')
    for(const kurs of(kurse??[])){
      const{data}=await supabase.from('buchungen').select('teilnehmer(vorname,nachname,oeak_nr)').eq('kurs_id',kurs.id).neq('zahlungsstatus','storniert')
      const tn=(data??[]).map((b:any)=>b.teilnehmer).sort((a:any,b:any)=>a.nachname.localeCompare(b.nachname))
      const html=`<html><head><style>body{font-family:Arial,sans-serif;padding:20mm}h1{font-size:14px;font-weight:bold}h2{font-size:11px;color:#666;margin-bottom:8mm}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;font-size:10px}th{background:#f5f5f5;font-weight:bold}@media print{@page{size:A4}}</style></head><body><h1>Anwesenheitsliste: ${kurs.titel}</h1><h2>${kurs.wochentag_datum} · ${k.name} ${k.jahr}</h2><table><thead><tr><th>#</th><th>Nachname</th><th>Vorname</th><th>ÖÄK-Nr.</th><th style="width:50px">Anwesend</th></tr></thead><tbody>${tn.map((t:any,i:number)=>`<tr><td>${i+1}</td><td>${t.nachname}</td><td>${t.vorname}</td><td>${t.oeak_nr}</td><td></td></tr>`).join('')}</tbody></table></body></html>`
      const win=window.open('','_blank');if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
    }
  }
  async function printNamensschilder(){
    if(!k)return;const{data}=await supabase.from('teilnehmer').select('vorname,nachname,land').eq('kongress_id',k.id).order('nachname')
    const html=`<html><head><style>body{font-family:Arial,sans-serif;padding:10mm}.s{width:85mm;height:54mm;border:1px solid #ccc;border-radius:6px;padding:8mm;display:inline-flex;flex-direction:column;justify-content:center;margin:2mm;vertical-align:top;page-break-inside:avoid}.n{font-size:18px;font-weight:bold}.v{font-size:14px;margin-top:3mm}.l{font-size:10px;color:#666;margin-top:5mm}@media print{@page{size:A4}}</style></head><body><p style="font-size:11px;color:#999;margin-bottom:5mm">${k.name} ${k.jahr} — Namensschilder (${(data??[]).length})</p>${(data??[]).map((t:any)=>`<div class="s"><div class="n">${t.nachname}</div><div class="v">${t.vorname}</div><div class="l">${t.land}</div></div>`).join('')}</body></html>`
    const win=window.open('','_blank');if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
  }
  const ITEMS=[
    {g:'CSV / Excel Export',items:[
      {icon:'👥',title:'Teilnehmerliste',desc:'Alle Teilnehmer mit Adressen',fn:exportTeilnehmer},
      {icon:'💶',title:'Buchungsliste',desc:'Alle Buchungen mit Status und Rechnungsnummern',fn:exportBuchungen},
      {icon:'⚠️',title:'Offene Zahlungen',desc:'Nur ausstehende Buchungen',fn:exportOffen},
      {icon:'🏢',title:'Sponsorenliste',desc:'Alle Sponsoren',fn:exportSponsoren},
      {icon:'🧾',title:'Sponsoren-Rechnungen',desc:'Alle Rechnungen mit Zahlungsstatus',fn:exportSpRechnungen},
    ]},
    {g:'PDF Drucken',items:[
      {icon:'✅',title:'Anwesenheitslisten',desc:'Pro Kurs eine Liste mit Unterschriften-Feld',fn:printAnwesenheit},
      {icon:'🏷️',title:'Namensschilder',desc:'Alle Teilnehmer als druckbare Schilder',fn:printNamensschilder},
    ]},
  ]
  return(
    <div>
      <PageHeader title="Export & Listen"/>
      <div className="p-6 space-y-8">
        {loading?<Loader/>:ITEMS.map(g=>(
          <div key={g.g}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">{g.g}</h2>
            <div className="grid grid-cols-3 gap-4">
              {g.items.map(item=>(
                <button key={item.title} onClick={item.fn} className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:border-[#FFBF00] hover:shadow-sm transition-all group">
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h3 className="font-bold text-sm mb-1 group-hover:text-amber-700">{item.title}</h3>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

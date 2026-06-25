'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress,type Kurs,getKurse}from'@/lib/db'
import{Loader,PageHeader}from'@/lib/ui'

export default function ExportPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[loading,setLoading]=useState(true)

  useEffect(()=>{
    getAktuellerKongress().then(async k=>{
      if(!k){setLoading(false);return}
      setK(k)
      setKurse(await getKurse(k.id))
      setLoading(false)
    })
  },[])

  function toCSV(rows:object[],filename:string){
    if(!rows.length)return
    const h=Object.keys(rows[0])
    const csv=[h.join(';'),...rows.map(r=>h.map(k=>{const v=(r as any)[k];return typeof v==='string'&&v.includes(';')?`"${v}"`:v??''}).join(';'))].join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download=filename;a.click()
  }

  async function exportTeilnehmerMitKursen(){
    if(!k)return
    const{data}=await supabase.from('teilnehmer').select('vorname,nachname,email,oeak_nr,strasse,hausnummer,postleitzahl,stadt,land,ist_oegsmp_mitglied,registriert_am').eq('kongress_id',k.id).order('nachname')
    const{data:buchungen}=await supabase.from('buchungen').select('teilnehmer_id,gebuchter_preis,zahlungsstatus,rechnungsnummer,kurse(titel)').eq('kongress_id',k.id).neq('zahlungsstatus','storniert')
    const rows=(data??[]).map((t:any)=>{
      const tb=(buchungen??[]).filter((b:any)=>b.teilnehmer_id===t.id)
      const kursListe=tb.map((b:any)=>b.kurse?.titel).filter(Boolean).join(' | ')
      const gesamtbetrag=tb.reduce((s:number,b:any)=>s+Number(b.gebuchter_preis),0)
      const bezahlt=tb.every((b:any)=>b.zahlungsstatus==='bezahlt')
      const rNr=[...new Set(tb.map((b:any)=>b.rechnungsnummer).filter(Boolean))].join(' | ')
      return{Nachname:t.nachname,Vorname:t.vorname,Email:t.email,OeAK_Nr:t.oeak_nr,Strasse:`${t.strasse} ${t.hausnummer}`,PLZ:t.postleitzahl,Stadt:t.stadt,Land:t.land,OEGSMP:t.ist_oegsmp_mitglied?'Ja':'Nein',Kurse:kursListe,Gesamtbetrag:gesamtbetrag.toFixed(2),Zahlung:bezahlt?'Bezahlt':'Ausstehend',Rechnungsnummer:rNr,Angemeldet:new Date(t.registriert_am).toLocaleDateString('de-AT')}
    })
    toCSV(rows,`Teilnehmer_Kurse_${k.jahr}.csv`)
  }

  async function exportBuchungen(){
    if(!k)return
    const{data}=await supabase.from('buchungen').select('id,gebucht_am,gebuchter_preis,zahlungsstatus,rechnungsnummer,zahlungs_eingang_am,teilnehmer(vorname,nachname,email,oeak_nr),kurse(titel)').eq('kongress_id',k.id).order('gebucht_am',{ascending:false})
    toCSV((data??[]).map((b:any)=>({ID:b.id,Datum:new Date(b.gebucht_am).toLocaleDateString('de-AT'),Nachname:b.teilnehmer?.nachname,Vorname:b.teilnehmer?.vorname,Email:b.teilnehmer?.email,OeAK:b.teilnehmer?.oeak_nr,Kurs:b.kurse?.titel,Preis:b.gebuchter_preis,Status:b.zahlungsstatus,Rechnungsnr:b.rechnungsnummer??'',Bezahlt:b.zahlungs_eingang_am?new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT'):''})),`Buchungen_${k.jahr}.csv`)
  }

  async function exportOffen(){
    if(!k)return
    const{data}=await supabase.from('buchungen').select('gebuchter_preis,gebucht_am,teilnehmer(vorname,nachname,email,oeak_nr),kurse(titel)').eq('kongress_id',k.id).eq('zahlungsstatus','ausstehend')
    toCSV((data??[]).map((b:any)=>({Nachname:b.teilnehmer?.nachname,Vorname:b.teilnehmer?.vorname,Email:b.teilnehmer?.email,OeAK:b.teilnehmer?.oeak_nr,Kurs:b.kurse?.titel,Preis:b.gebuchter_preis,Angemeldet:new Date(b.gebucht_am).toLocaleDateString('de-AT')})),`Offene_Zahlungen_${k.jahr}.csv`)
  }

  async function exportSponsoren(){
    if(!k)return
    const{data}=await supabase.from('sponsoren').select('firmenname,ansprechperson,email,strasse,hausnummer,plz,ort,land,uid_nr').eq('kongress_id',k.id)
    toCSV(data??[],`Sponsoren_${k.jahr}.csv`)
  }

  async function exportSpRechnungen(){
    if(!k)return
    const{data}=await supabase.from('sponsoren_rechnungen').select('rechnungsnummer,beschreibung,betrag_netto,betrag_brutto,mwst_typ,zahlungsstatus,erstellt_am,bezahlt_am,sponsoren(firmenname,email)').eq('kongress_id',k.id)
    toCSV((data??[]).map((r:any)=>({Nr:r.rechnungsnummer??'',Firma:r.sponsoren?.firmenname,Email:r.sponsoren?.email,Beschreibung:r.beschreibung,Netto:r.betrag_netto,Brutto:r.betrag_brutto,MwSt:r.mwst_typ,Status:r.zahlungsstatus,Erstellt:r.erstellt_am?new Date(r.erstellt_am).toLocaleDateString('de-AT'):'',Bezahlt:r.bezahlt_am?new Date(r.bezahlt_am).toLocaleDateString('de-AT'):''})),`Sponsoren_Rechnungen_${k.jahr}.csv`)
  }

  // GESAMTLISTE PDF
  async function printGesamtliste(){
    if(!k)return
    const{data:tn}=await supabase.from('teilnehmer').select('id,vorname,nachname,email,oeak_nr,land,ist_oegsmp_mitglied').eq('kongress_id',k.id).order('nachname')
    const{data:buchungen}=await supabase.from('buchungen').select('teilnehmer_id,gebuchter_preis,zahlungsstatus,kurse(titel)').eq('kongress_id',k.id).neq('zahlungsstatus','storniert')
    const rows=(tn??[]).map((t:any,i:number)=>{
      const tb=(buchungen??[]).filter((b:any)=>b.teilnehmer_id===t.id)
      const kursListe=tb.map((b:any)=>b.kurse?.titel).filter(Boolean).join(', ')
      const betrag=tb.reduce((s:number,b:any)=>s+Number(b.gebuchter_preis),0)
      const bezahlt=tb.every((b:any)=>b.zahlungsstatus==='bezahlt')
      return`<tr style="border-bottom:1px solid #f0f0f0;${i%2===0?'background:#fafafa':''}">
        <td style="padding:5px 8px;font-size:10px;font-weight:600">${t.nachname} ${t.vorname}</td>
        <td style="padding:5px 8px;font-size:10px;color:#666">${t.email}</td>
        <td style="padding:5px 8px;font-size:10px;font-family:monospace">${t.oeak_nr}</td>
        <td style="padding:5px 8px;font-size:10px">${t.land}</td>
        <td style="padding:5px 8px;font-size:10px">${kursListe}</td>
        <td style="padding:5px 8px;font-size:10px;text-align:right;font-weight:600">€ ${betrag.toFixed(2)}</td>
        <td style="padding:5px 8px;font-size:10px;text-align:center"><span style="color:${bezahlt?'#16a34a':'#d97706'};font-weight:700">${bezahlt?'✓ Bezahlt':'Offen'}</span></td>
      </tr>`
    }).join('')
    const html=`<html><head><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse}th{background:#FFBF00;padding:6px 8px;font-size:10px;text-align:left;font-weight:700}@media print{@page{size:A4 landscape}}</style></head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div><h1 style="font-size:14px;font-weight:800;margin:0">${k.name} ${k.jahr}</h1><p style="font-size:11px;color:#666;margin:2px 0">Gesamtliste Teilnehmer — Stand: ${new Date().toLocaleDateString('de-AT')}</p></div>
        <p style="font-size:11px;font-weight:700">${(tn??[]).length} Teilnehmer</p>
      </div>
      <table><thead><tr><th>Name</th><th>E-Mail</th><th>ÖÄK-Nr.</th><th>Land</th><th>Gebuchte Kurse</th><th style="text-align:right">Betrag</th><th style="text-align:center">Zahlung</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`
    const win=window.open('','_blank');if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
  }

  // ANWESENHEITSLISTE PRO KURS
  async function printAnwesenheitsliste(kurs:Kurs){
    if(!k)return
    const{data}=await supabase.from('buchungen').select('teilnehmer(vorname,nachname,oeak_nr,land,email)').eq('kurs_id',kurs.id).neq('zahlungsstatus','storniert')
    const tn=(data??[]).map((b:any)=>b.teilnehmer).sort((a:any,b:any)=>a.nachname.localeCompare(b.nachname))
    const rows=tn.map((t:any,i:number)=>`
      <tr style="border-bottom:1px solid #e0e0e0">
        <td style="padding:7px 8px;font-size:11px;width:25px">${i+1}</td>
        <td style="padding:7px 8px;font-size:11px;font-weight:600">${t.nachname} ${t.vorname}</td>
        <td style="padding:7px 8px;font-size:11px;font-family:monospace">${t.oeak_nr}</td>
        <td style="padding:7px 8px;font-size:11px;color:#666">${t.land}</td>
        <td style="padding:7px 8px;font-size:11px;color:#666">${t.email}</td>
        <td style="padding:7px 8px;width:50px;border-left:2px solid #ccc"></td>
      </tr>`).join('')
    const html=`<html><head><style>@page{size:A4;margin:15mm}body{font-family:Arial,sans-serif}table{width:100%;border-collapse:collapse}th{background:#FFBF00;padding:7px 8px;font-size:10px;text-align:left;font-weight:700;border:1px solid #e0e0e0}@media print{@page{size:A4}}</style></head>
    <body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <h1 style="font-size:15px;font-weight:800;margin:0 0 3px">Anwesenheitsliste</h1>
          <h2 style="font-size:13px;font-weight:700;color:#B45309;margin:0 0 3px">${kurs.titel}</h2>
          <p style="font-size:11px;color:#666;margin:0">${kurs.uhrzeit??kurs.wochentag_datum} · ${k.name} ${k.jahr}</p>
        </div>
        <div style="text-align:right;font-size:11px;color:#666">
          <p style="margin:0;font-weight:700">${tn.length} Teilnehmer</p>
          <p style="margin:3px 0 0">Stand: ${new Date().toLocaleDateString('de-AT')}</p>
        </div>
      </div>
      <table>
        <thead><tr>
          <th style="width:25px">#</th>
          <th>Name</th>
          <th style="width:100px">ÖÄK-Nr.</th>
          <th style="width:80px">Land</th>
          <th>E-Mail</th>
          <th style="width:50px;border-left:2px solid #999;text-align:center">✓</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;font-size:10px;color:#888;display:flex;justify-content:space-between">
        <span>Unterschrift Kursleiter: _______________________________</span>
        <span>Datum: _______________________________</span>
      </div>
    </body></html>`
    const win=window.open('','_blank');if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
  }

  async function printNamensschilder(){
    if(!k)return
    const{data}=await supabase.from('teilnehmer').select('vorname,nachname,land').eq('kongress_id',k.id).order('nachname')
    const html=`<html><head><style>@page{size:A4}body{font-family:Arial,sans-serif;padding:10mm}.s{width:85mm;height:54mm;border:1px solid #ccc;border-radius:6px;padding:8mm;display:inline-flex;flex-direction:column;justify-content:center;margin:2mm;vertical-align:top;page-break-inside:avoid}.n{font-size:18px;font-weight:bold}.v{font-size:14px;margin-top:3mm}.l{font-size:10px;color:#666;margin-top:5mm}@media print{@page{size:A4}}</style></head>
    <body><p style="font-size:11px;color:#999;margin-bottom:5mm">${k.name} ${k.jahr} — Namensschilder (${(data??[]).length})</p>${(data??[]).map((t:any)=>`<div class="s"><div class="n">${t.nachname}</div><div class="v">${t.vorname}</div><div class="l">${t.land}</div></div>`).join('')}</body></html>`
    const win=window.open('','_blank');if(win){win.document.write(html);win.document.close();setTimeout(()=>win.print(),500)}
  }

  return(
    <div>
      <PageHeader title="Export & Listen"/>
      <div className="p-6 space-y-8">
        {loading?<Loader/>:<>

          {/* PDF DRUCKEN */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">PDF Drucken & Exportieren</h2>
            <div className="grid grid-cols-3 gap-4">
              <ExportCard icon="📋" title="Gesamtliste Teilnehmer" desc="Alle Teilnehmer mit Kursen, Betrag und Zahlungsstatus — druckbar als PDF (Querformat)" onClick={printGesamtliste} highlight/>
              <ExportCard icon="🏷️" title="Namensschilder" desc="Alle Teilnehmer als druckbare Schilder (A4)" onClick={printNamensschilder}/>
            </div>
          </div>

          {/* ANWESENHEITSLISTEN PRO KURS */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Anwesenheitslisten pro Kurs</h2>
            <p className="text-xs text-gray-400 mb-3">Mit Name, ÖÄK-Nr., Land, E-Mail und Unterschriftsfeld — für Kursleiter</p>
            <div className="grid grid-cols-3 gap-3">
              {kurse.map(kurs=>(
                <button key={kurs.id} onClick={()=>printAnwesenheitsliste(kurs)}
                  className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-[#FFBF00] hover:shadow-sm transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-amber-700">{kurs.titel}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{kurs.uhrzeit??kurs.wochentag_datum}</p>
                    </div>
                    <span className="text-lg flex-shrink-0">🖨️</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* CSV EXPORT */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">CSV / Excel Export</h2>
            <div className="grid grid-cols-3 gap-4">
              <ExportCard icon="👥" title="Teilnehmer mit Kursen" desc="Alle Teilnehmer inkl. gebuchter Kurse, Betrag und Zahlungsstatus" onClick={exportTeilnehmerMitKursen}/>
              <ExportCard icon="💶" title="Buchungsliste" desc="Alle einzelnen Buchungen mit Status und Rechnungsnummern" onClick={exportBuchungen}/>
              <ExportCard icon="⚠️" title="Offene Zahlungen" desc="Nur ausstehende Buchungen" onClick={exportOffen}/>
              <ExportCard icon="🏢" title="Sponsorenliste" desc="Alle Sponsoren mit Kontaktdaten" onClick={exportSponsoren}/>
              <ExportCard icon="🧾" title="Sponsoren-Rechnungen" desc="Alle Rechnungen mit Zahlungsstatus" onClick={exportSpRechnungen}/>
            </div>
          </div>
        </>}
      </div>
    </div>
  )
}

function ExportCard({icon,title,desc,onClick,highlight}:{icon:string;title:string;desc:string;onClick:()=>void;highlight?:boolean}){
  return(
    <button onClick={onClick} className={`text-left rounded-2xl p-5 transition-all group hover:shadow-sm ${highlight?'bg-[#FFF9E6] border-2 border-[#FFE082] hover:border-[#FFBF00]':'bg-white border border-gray-200 hover:border-[#FFBF00]'}`}>
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className={`font-bold text-sm mb-1 group-hover:text-amber-700 ${highlight?'text-amber-800':''}`}>{title}</h3>
      <p className="text-xs text-gray-400">{desc}</p>
    </button>
  )
}

'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,getPreis,isFruehbucher,type Kongress,type Teilnehmer,type Kurs}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;kurse:{titel:string;wochentag_datum:string;uhrzeit:string|null}}

export default function TeilnehmerPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[list,setList]=useState<Teilnehmer[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[sortDir,setSortDir]=useState<'asc'|'desc'>('asc')
  const[expanded,setExpanded]=useState<number|null>(null)
  const[tnBuchungen,setTnBuchungen]=useState<Record<number,Buchung[]>>({})
  const[edit,setEdit]=useState<Teilnehmer|null>(null)
  const[saving,setSaving]=useState(false)
  const[kursEdit,setKursEdit]=useState<Teilnehmer|null>(null)
  const[kursLoading,setKursLoading]=useState(false)
  const[kursSaving,setKursSaving]=useState(false)
  const[konfliktMsg,setKonfliktMsg]=useState('')

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const[{data:tn},allKurse]=await Promise.all([
      supabase.from('teilnehmer').select('*').eq('kongress_id',k.id).order('nachname'),
      getKurse(k.id)
    ])
    setList((tn as Teilnehmer[])??[])
    setKurse(allKurse)
    setLoading(false)
  })},[])

  const filtered=list
    .filter(t=>!q||`${t.vorname} ${t.nachname} ${t.email} ${t.oeak_nr}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>sortDir==='asc'?a.nachname.localeCompare(b.nachname):b.nachname.localeCompare(a.nachname))

  async function toggleExpand(t:Teilnehmer){
    if(expanded===t.id){setExpanded(null);return}
    setExpanded(t.id)
    if(!tnBuchungen[t.id]){
      const{data}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel,wochentag_datum,uhrzeit)').eq('teilnehmer_id',t.id)
      setTnBuchungen(prev=>({...prev,[t.id]:(data as unknown as Buchung[])??[]}))
    }
  }

  async function save(){
    if(!edit)return;setSaving(true)
    await supabase.from('teilnehmer').update({vorname:edit.vorname,nachname:edit.nachname,email:edit.email,strasse:edit.strasse,hausnummer:edit.hausnummer,postleitzahl:edit.postleitzahl,stadt:edit.stadt,land:edit.land,oeak_nr:edit.oeak_nr,ist_oegsmp_mitglied:edit.ist_oegsmp_mitglied}).eq('id',edit.id)
    setList(prev=>prev.map(t=>t.id===edit.id?edit:t));setEdit(null);setSaving(false)
  }

  async function del(id:number){
    if(!confirm('Teilnehmer und alle Buchungen löschen? (DSGVO)'))return
    await supabase.from('buchungen').delete().eq('teilnehmer_id',id)
    await supabase.from('teilnehmer').delete().eq('id',id)
    setList(prev=>prev.filter(t=>t.id!==id))
    setExpanded(null)
  }

  async function openKursEdit(t:Teilnehmer){
    setKursEdit(t);setKursLoading(true);setKonfliktMsg('')
    const{data}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel,wochentag_datum,uhrzeit)').eq('teilnehmer_id',t.id)
    setTnBuchungen(prev=>({...prev,[t.id]:(data as unknown as Buchung[])??[]}))
    setKursLoading(false)
  }

  async function removeBuchung(tnId:number, buchungId:number){
    if(!confirm('Kurs wirklich entfernen?'))return
    await supabase.from('buchungen').delete().eq('id',buchungId)
    setTnBuchungen(prev=>({...prev,[tnId]:prev[tnId].filter(b=>b.id!==buchungId)}))
    setKonfliktMsg('')
  }

  function checkKonflikt(kurs:Kurs, aktuelleBuchungen:Buchung[]): string {
    // Exklusiv-Gruppe (GK LIP <-> Work-Shop)
    if(kurs.exklusiv_gruppe){
      const clash=aktuelleBuchungen.find(b=>{
        const gebuchterKurs=kurse.find(k=>k.id===b.kurs_id)
        return gebuchterKurs?.exklusiv_gruppe===kurs.exklusiv_gruppe && b.kurs_id!==kurs.id && b.zahlungsstatus!=='storniert'
      })
      if(clash){
        const clashTitel=kurse.find(k=>k.id===clash.kurs_id)?.titel??'einen anderen Kurs'
        return `Bitte zuerst "${clashTitel}" entfernen bevor "${kurs.titel}" gebucht werden kann — diese Kurse laufen gleichzeitig.`
      }
    }
    // PS/TS Konflikt (gleiche Nummer)
    const num=parseInt(kurs.titel.replace(/\D/g,''))
    if(!isNaN(num)&&['ps','ts'].includes(kurs.kurs_gruppe)){
      const parallelKurs=aktuelleBuchungen.find(b=>{
        const bk=kurse.find(k=>k.id===b.kurs_id)
        return bk&&['ps','ts'].includes(bk.kurs_gruppe)&&bk.kurs_gruppe!==kurs.kurs_gruppe&&parseInt(bk.titel.replace(/\D/g,''))===num&&b.zahlungsstatus!=='storniert'
      })
      if(parallelKurs){
        const pTitel=kurse.find(k=>k.id===parallelKurs.kurs_id)?.titel??''
        return `Bitte zuerst "${pTitel}" entfernen — PS und TS mit gleicher Nummer laufen parallel.`
      }
    }
    return ''
  }

  async function addKurs(kurs:Kurs){
    if(!kursEdit||!k)return
    const aktuell=tnBuchungen[kursEdit.id]??[]
    if(aktuell.find(b=>b.kurs_id===kurs.id&&b.zahlungsstatus!=='storniert')){
      setKonfliktMsg('Dieser Kurs ist bereits gebucht.')
      return
    }
    const konflikt=checkKonflikt(kurs,aktuell)
    if(konflikt){setKonfliktMsg(konflikt);return}
    setKonfliktMsg('');setKursSaving(true)
    const frueh=isFruehbucher(k)
    const tn=list.find(t=>t.id===kursEdit.id)!
    const preis=getPreis(kurs,tn.ist_oegsmp_mitglied,frueh)
    const{data}=await supabase.from('buchungen').insert({
      teilnehmer_id:kursEdit.id,kurs_id:kurs.id,
      gebuchter_preis:preis,zahlungsstatus:'ausstehend',
      kongress_id:k.id,gebucht_am:new Date().toISOString()
    }).select('id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel,wochentag_datum,uhrzeit)').single()
    if(data)setTnBuchungen(prev=>({...prev,[kursEdit.id]:[...(prev[kursEdit.id]??[]),data as unknown as Buchung]}))
    setKursSaving(false)
  }

  const ST:Record<string,{label:string;v:'green'|'yellow'|'red'}>={bezahlt:{label:'Bezahlt',v:'green'},ausstehend:{label:'Ausstehend',v:'yellow'},storniert:{label:'Storniert',v:'red'}}

  return(
    <div>
      <PageHeader title="Teilnehmer" sub={`${filtered.length} Einträge`}>
        <input placeholder="Name, E-Mail, ÖÄK-Nr." value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-60 focus:outline-none focus:border-[#FFBF00]"/>
        <button onClick={()=>setSortDir(d=>d==='asc'?'desc':'asc')} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition-all">
          A-Z {sortDir==='asc'?'↑':'↓'}
        </button>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {filtered.length===0&&<div className="text-center py-12 text-gray-400 text-sm">Keine Einträge gefunden.</div>}
            {filtered.map((t,i)=>{
              const isOpen=expanded===t.id
              const buchungen=tnBuchungen[t.id]??[]
              return(
                <div key={t.id} className={i>0?'border-t border-gray-100':''}>
                  {/* HAUPTZEILE */}
                  <div className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-all ${isOpen?'bg-[#FFF9E6]':'hover:bg-gray-50'}`} onClick={()=>toggleExpand(t)}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border-2 transition-all ${isOpen?'border-[#FFBF00] bg-[#FFBF00] text-black':'border-gray-300 text-gray-400'}`}>
                      {isOpen?'−':'+'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900">{t.nachname} {t.vorname}</span>
                      <span className="text-xs text-gray-400 ml-3">{t.email}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {t.ist_oegsmp_mitglied&&<Badge label="ÖGSMP" variant="blue"/>}
                      <span className="text-xs text-gray-400 hidden sm:block">{new Date(t.registriert_am).toLocaleDateString('de-AT')}</span>
                      <div className="flex gap-1.5" onClick={e=>e.stopPropagation()}>
                        <Btn size="sm" variant="outline" onClick={()=>setEdit({...t})}>Bearbeiten</Btn>
                        <Btn size="sm" variant="outline" onClick={()=>openKursEdit(t)}>Kurse</Btn>
                        <Btn size="sm" variant="danger" onClick={()=>del(t.id)}>Löschen</Btn>
                      </div>
                    </div>
                  </div>

                  {/* AUFGEKLAPPTE DETAILS */}
                  {isOpen&&(
                    <div className="px-12 pb-4 bg-[#FFFDF5] border-t border-[#FFE082]/50">
                      <div className="grid grid-cols-2 gap-6 pt-4">
                        {/* PERSÖNLICHE DATEN */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Persönliche Daten</p>
                          <div className="space-y-1.5 text-sm">
                            {[['Adresse',`${t.strasse} ${t.hausnummer}`],['PLZ / Stadt',`${t.postleitzahl} ${t.stadt}`],['Land',t.land],['ÖÄK-Nr.',t.oeak_nr],['E-Mail',t.email],['ÖGSMP',t.ist_oegsmp_mitglied?'Ja':'Nein'],['Angemeldet',new Date(t.registriert_am).toLocaleDateString('de-AT')]].map(([l,v])=>(
                              <div key={l} className="flex gap-3">
                                <span className="text-gray-400 w-24 flex-shrink-0 text-xs">{l}</span>
                                <span className="font-medium text-gray-800 text-xs">{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* BUCHUNGEN */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Gebuchte Kurse</p>
                          {buchungen.length===0?<p className="text-xs text-gray-400">Keine Kurse gebucht</p>:(
                            <div className="space-y-2">
                              {buchungen.map(b=>{
                                const st=ST[b.zahlungsstatus]??ST['ausstehend']
                                return(
                                  <div key={b.id} className={`rounded-lg border p-2.5 ${b.zahlungsstatus==='storniert'?'border-red-200 bg-red-50':'border-gray-200 bg-white'}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-gray-800">{b.kurse.titel}</span>
                                      <Badge label={st.label} variant={st.v}/>
                                    </div>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-[10px] text-gray-400">{b.kurse.uhrzeit??b.kurse.wochentag_datum}</span>
                                      <span className="text-xs font-bold text-gray-700">€ {b.gebuchter_preis.toFixed(2)}</span>
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="flex justify-between pt-1 border-t border-gray-200 text-xs font-bold">
                                <span>Gesamt</span>
                                <span>€ {buchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* DATEN BEARBEITEN */}
      {edit&&(
        <Modal title="Teilnehmer bearbeiten" onClose={()=>setEdit(null)}>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Field label="Vorname *" id="e-vn" value={edit.vorname} onChange={v=>setEdit({...edit,vorname:v})}/>
            <Field label="Nachname *" id="e-nn" value={edit.nachname} onChange={v=>setEdit({...edit,nachname:v})}/>
            <Field label="E-Mail *" id="e-em" value={edit.email} onChange={v=>setEdit({...edit,email:v})} span2 type="email"/>
            <Field label="Straße *" id="e-st" value={edit.strasse} onChange={v=>setEdit({...edit,strasse:v})} span2/>
            <Field label="Hausnummer *" id="e-hn" value={edit.hausnummer} onChange={v=>setEdit({...edit,hausnummer:v})}/>
            <Field label="PLZ *" id="e-plz" value={edit.postleitzahl} onChange={v=>setEdit({...edit,postleitzahl:v})}/>
            <Field label="Stadt *" id="e-ct" value={edit.stadt} onChange={v=>setEdit({...edit,stadt:v})} span2/>
            <Field label="Land *" id="e-ld" value={edit.land} onChange={v=>setEdit({...edit,land:v})}/>
            <Field label="ÖÄK-Nr. *" id="e-ok" value={edit.oeak_nr} onChange={v=>setEdit({...edit,oeak_nr:v})}/>
            <div className="col-span-2"><label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={edit.ist_oegsmp_mitglied} onChange={e=>setEdit({...edit,ist_oegsmp_mitglied:e.target.checked})} className="accent-amber-500"/>
              <span className="text-sm">Aktives ÖGSMP-Mitglied</span>
            </label></div>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn>
            <Btn onClick={save} disabled={saving}>{saving?'Speichert…':'Speichern'}</Btn>
          </div>
        </Modal>
      )}

      {/* KURSE BEARBEITEN */}
      {kursEdit&&(
        <Modal title={`Kurse — ${kursEdit.nachname} ${kursEdit.vorname}`} onClose={()=>{setKursEdit(null);setKonfliktMsg('')}} wide>
          {kursLoading?<Loader/>:<>
            {konfliktMsg&&(
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-3 rounded-xl mb-4 flex items-start gap-2">
                <span className="text-amber-500 font-bold flex-shrink-0">⚠</span>
                <span>{konfliktMsg}</span>
              </div>
            )}
            {/* Gebuchte Kurse */}
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Gebuchte Kurse</p>
              {(tnBuchungen[kursEdit.id]??[]).length===0&&<p className="text-sm text-gray-400">Keine Kurse gebucht</p>}
              {(tnBuchungen[kursEdit.id]??[]).map(b=>(
                <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border mb-2 ${b.zahlungsstatus==='storniert'?'border-red-200 bg-red-50':'border-gray-200 bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold">{b.kurse.titel}</p>
                    <p className="text-xs text-gray-400">{b.kurse.uhrzeit??b.kurse.wochentag_datum} · <span className={b.zahlungsstatus==='bezahlt'?'text-green-600':b.zahlungsstatus==='storniert'?'text-red-500':'text-amber-600'}>{b.zahlungsstatus}</span></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">€ {b.gebuchter_preis.toFixed(2)}</span>
                    <Btn size="sm" variant="danger" onClick={()=>{setKonfliktMsg('');removeBuchung(kursEdit.id,b.id)}}>Entfernen</Btn>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-gray-100 mt-2 text-sm font-bold">
                <span>Gesamt</span>
                <span>€ {(tnBuchungen[kursEdit.id]??[]).filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>

            {/* Kurs hinzufügen */}
            {kurse.filter(kurs=>!(tnBuchungen[kursEdit.id]??[]).find(b=>b.kurs_id===kurs.id&&b.zahlungsstatus!=='storniert')).length>0&&(
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Kurs hinzubuchen</p>
                <div className="space-y-2">
                  {kurse.filter(kurs=>!(tnBuchungen[kursEdit.id]??[]).find(b=>b.kurs_id===kurs.id&&b.zahlungsstatus!=='storniert')).map(kurs=>{
                    const frueh=k?isFruehbucher(k):false
                    const tn=list.find(t=>t.id===kursEdit.id)!
                    const preis=getPreis(kurs,tn.ist_oegsmp_mitglied,frueh)
                    const hatKonflikt=checkKonflikt(kurs,tnBuchungen[kursEdit.id]??[])!==''
                    return(
                      <div key={kurs.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${hatKonflikt?'border-gray-200 bg-gray-50 opacity-60':'border-gray-200 hover:border-[#FFBF00] bg-white'}`}>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{kurs.titel}</p>
                          <p className="text-xs text-gray-400">{kurs.uhrzeit??kurs.wochentag_datum}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm">€ {preis.toFixed(2)}</span>
                          <Btn size="sm" disabled={kursSaving} onClick={()=>addKurs(kurs)}>+ Hinzufügen</Btn>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>}
          <div className="flex justify-end mt-5">
            <Btn variant="outline" onClick={()=>{setKursEdit(null);setKonfliktMsg('')}}>Schließen</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

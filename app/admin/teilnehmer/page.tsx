'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,getKurse,getPreis,isFruehbucher,type Kongress,type Teilnehmer,type Kurs}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'

type Buchung={id:number;kurs_id:number;gebuchter_preis:number;zahlungsstatus:string;kurse:{titel:string;wochentag_datum:string}}

export default function TeilnehmerPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[list,setList]=useState<Teilnehmer[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[edit,setEdit]=useState<Teilnehmer|null>(null)
  const[saving,setSaving]=useState(false)
  const[kursEdit,setKursEdit]=useState<Teilnehmer|null>(null)
  const[tnBuchungen,setTnBuchungen]=useState<Buchung[]>([])
  const[kursLoading,setKursLoading]=useState(false)
  const[kursSaving,setKursSaving]=useState(false)

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

  const filtered=list.filter(t=>!q||`${t.vorname} ${t.nachname} ${t.email} ${t.oeak_nr}`.toLowerCase().includes(q.toLowerCase()))

  async function save(){
    if(!edit)return;setSaving(true)
    await supabase.from('teilnehmer').update({vorname:edit.vorname,nachname:edit.nachname,email:edit.email,strasse:edit.strasse,hausnummer:edit.hausnummer,postleitzahl:edit.postleitzahl,stadt:edit.stadt,land:edit.land,oeak_nr:edit.oeak_nr,ist_oegsmp_mitglied:edit.ist_oegsmp_mitglied}).eq('id',edit.id)
    setList(prev=>prev.map(t=>t.id===edit.id?edit:t));setEdit(null);setSaving(false)
  }

  async function del(id:number){
    if(!confirm('Teilnehmer und alle Buchungen loeschen? (DSGVO)'))return
    await supabase.from('buchungen').delete().eq('teilnehmer_id',id)
    await supabase.from('teilnehmer').delete().eq('id',id)
    setList(prev=>prev.filter(t=>t.id!==id))
  }

  async function openKursEdit(t:Teilnehmer){
    setKursEdit(t);setKursLoading(true)
    const{data}=await supabase.from('buchungen').select('id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel,wochentag_datum)').eq('teilnehmer_id',t.id)
    setTnBuchungen((data as unknown as Buchung[])??[])
    setKursLoading(false)
  }

  async function removeBuchung(buchungId:number){
    if(!confirm('Kurs wirklich entfernen?'))return
    await supabase.from('buchungen').delete().eq('id',buchungId)
    setTnBuchungen(prev=>prev.filter(b=>b.id!==buchungId))
  }

  async function addKurs(kurs:Kurs){
    if(!kursEdit||!k)return
    const already=tnBuchungen.find(b=>b.kurs_id===kurs.id)
    if(already){alert('Dieser Kurs ist bereits gebucht.');return}
    setKursSaving(true)
    const frueh=isFruehbucher(k)
    const tn=list.find(t=>t.id===kursEdit.id)!
    const preis=getPreis(kurs,tn.ist_oegsmp_mitglied,frueh)
    const{data}=await supabase.from('buchungen').insert({
      teilnehmer_id:kursEdit.id,kurs_id:kurs.id,
      gebuchter_preis:preis,zahlungsstatus:'ausstehend',
      kongress_id:k.id,gebucht_am:new Date().toISOString()
    }).select('id,kurs_id,gebuchter_preis,zahlungsstatus,kurse(titel,wochentag_datum)').single()
    if(data)setTnBuchungen(prev=>[...prev,data as unknown as Buchung])
    setKursSaving(false)
  }

  const gebuchteKursIds=new Set(tnBuchungen.map(b=>b.kurs_id))
  const verfuegbareKurse=kurse.filter(k=>!gebuchteKursIds.has(k.id))

  return(
    <div>
      <PageHeader title="Teilnehmer" sub={`${filtered.length} Eintraege`}>
        <input placeholder="Name, E-Mail, OeAK-Nr." value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-60 focus:outline-none focus:border-[#FFBF00]"/>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <Table headers={['Name','E-Mail','OeAK-Nr.','PLZ Ort','Land','OEGSMP','Angemeldet','']} empty={filtered.length===0}>
            {filtered.map(t=>(
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{t.nachname} {t.vorname}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.email}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.oeak_nr}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.postleitzahl} {t.stadt}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.land}</td>
                <td className="px-4 py-3">{t.ist_oegsmp_mitglied&&<Badge label="OEGSMP" variant="blue"/>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(t.registriert_am).toLocaleDateString('de-AT')}</td>
                <td className="px-4 py-3"><div className="flex gap-2">
                  <Btn size="sm" variant="outline" onClick={()=>setEdit({...t})}>Bearbeiten</Btn>
                  <Btn size="sm" variant="outline" onClick={()=>openKursEdit(t)}>Kurse</Btn>
                  <Btn size="sm" variant="danger" onClick={()=>del(t.id)}>Loeschen</Btn>
                </div></td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      {edit&&(
        <Modal title="Teilnehmer bearbeiten" onClose={()=>setEdit(null)}>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Field label="Vorname *" id="e-vn" value={edit.vorname} onChange={v=>setEdit({...edit,vorname:v})}/>
            <Field label="Nachname *" id="e-nn" value={edit.nachname} onChange={v=>setEdit({...edit,nachname:v})}/>
            <Field label="E-Mail *" id="e-em" value={edit.email} onChange={v=>setEdit({...edit,email:v})} span2 type="email"/>
            <Field label="Strasse *" id="e-st" value={edit.strasse} onChange={v=>setEdit({...edit,strasse:v})} span2/>
            <Field label="Hausnummer *" id="e-hn" value={edit.hausnummer} onChange={v=>setEdit({...edit,hausnummer:v})}/>
            <Field label="PLZ *" id="e-plz" value={edit.postleitzahl} onChange={v=>setEdit({...edit,postleitzahl:v})}/>
            <Field label="Stadt *" id="e-ct" value={edit.stadt} onChange={v=>setEdit({...edit,stadt:v})} span2/>
            <Field label="Land *" id="e-ld" value={edit.land} onChange={v=>setEdit({...edit,land:v})}/>
            <Field label="OeAK-Nr. *" id="e-ok" value={edit.oeak_nr} onChange={v=>setEdit({...edit,oeak_nr:v})}/>
            <div className="col-span-2"><label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={edit.ist_oegsmp_mitglied} onChange={e=>setEdit({...edit,ist_oegsmp_mitglied:e.target.checked})} className="accent-amber-500"/>
              <span className="text-sm">Aktives OEGSMP-Mitglied</span>
            </label></div>
          </div>
          <div className="flex gap-3 justify-end">
            <Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn>
            <Btn onClick={save} disabled={saving}>{saving?'Speichert...':'Speichern'}</Btn>
          </div>
        </Modal>
      )}

      {kursEdit&&(
        <Modal title={`Kurse - ${kursEdit.nachname} ${kursEdit.vorname}`} onClose={()=>setKursEdit(null)} wide>
          {kursLoading?<Loader/>:<>
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Gebuchte Kurse</p>
              {tnBuchungen.length===0&&<p className="text-sm text-gray-400">Keine Kurse gebucht</p>}
              {tnBuchungen.map(b=>(
                <div key={b.id} className={`flex items-center justify-between p-3 rounded-xl border mb-2 ${b.zahlungsstatus==='storniert'?'border-red-200 bg-red-50':'border-gray-200 bg-gray-50'}`}>
                  <div>
                    <p className="text-sm font-semibold">{b.kurse.titel}</p>
                    <p className="text-xs text-gray-400">{b.kurse.wochentag_datum} · <span className={b.zahlungsstatus==='bezahlt'?'text-green-600':b.zahlungsstatus==='storniert'?'text-red-500':'text-amber-600'}>{b.zahlungsstatus}</span></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm">EUR {b.gebuchter_preis.toFixed(2)}</span>
                    <Btn size="sm" variant="danger" onClick={()=>removeBuchung(b.id)}>Entfernen</Btn>
                  </div>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-gray-100 mt-2">
                <span className="text-sm font-semibold">Gesamt</span>
                <span className="text-sm font-bold">EUR {tnBuchungen.filter(b=>b.zahlungsstatus!=='storniert').reduce((s,b)=>s+b.gebuchter_preis,0).toFixed(2)}</span>
              </div>
            </div>
            {verfuegbareKurse.length>0&&(
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Kurs hinzubuchen</p>
                <div className="space-y-2">
                  {verfuegbareKurse.map(kurs=>{
                    const frueh=k?isFruehbucher(k):false
                    const tn=list.find(t=>t.id===kursEdit.id)!
                    const preis=getPreis(kurs,tn.ist_oegsmp_mitglied,frueh)
                    return(
                      <div key={kurs.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:border-[#FFBF00] bg-white transition-all">
                        <div>
                          <p className="text-sm font-semibold">{kurs.titel}</p>
                          <p className="text-xs text-gray-400">{kurs.wochentag_datum}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm">EUR {preis.toFixed(2)}</span>
                          <Btn size="sm" disabled={kursSaving} onClick={()=>addKurs(kurs)}>+ Hinzufuegen</Btn>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>}
          <div className="flex justify-end mt-5">
            <Btn variant="outline" onClick={()=>setKursEdit(null)}>Schliessen</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

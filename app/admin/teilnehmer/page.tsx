'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress,type Teilnehmer}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'
export default function TeilnehmerPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[list,setList]=useState<Teilnehmer[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState('')
  const[edit,setEdit]=useState<Teilnehmer|null>(null)
  const[saving,setSaving]=useState(false)
  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);const{data}=await supabase.from('teilnehmer').select('*').eq('kongress_id',k.id).order('nachname');setList((data as Teilnehmer[])??[]);setLoading(false)})},[])
  const filtered=list.filter(t=>!q||`${t.vorname} ${t.nachname} ${t.email} ${t.oeak_nr}`.toLowerCase().includes(q.toLowerCase()))
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
  }
  return(
    <div>
      <PageHeader title="Teilnehmer" sub={`${filtered.length} Einträge`}>
        <input placeholder="Name, E-Mail, ÖÄK-Nr." value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-60 focus:outline-none focus:border-[#FFBF00]"/>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <Table headers={['Name','E-Mail','ÖÄK-Nr.','PLZ Ort','Land','ÖGSMP','Angemeldet','']} empty={filtered.length===0}>
            {filtered.map(t=>(
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold whitespace-nowrap">{t.nachname} {t.vorname}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.email}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{t.oeak_nr}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.postleitzahl} {t.stadt}</td>
                <td className="px-4 py-3 text-gray-500 text-xs">{t.land}</td>
                <td className="px-4 py-3">{t.ist_oegsmp_mitglied&&<Badge label="ÖGSMP" variant="blue"/>}</td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(t.registriert_am).toLocaleDateString('de-AT')}</td>
                <td className="px-4 py-3"><div className="flex gap-2"><Btn size="sm" variant="outline" onClick={()=>setEdit({...t})}>Bearbeiten</Btn><Btn size="sm" variant="danger" onClick={()=>del(t.id)}>Löschen</Btn></div></td>
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
            <Field label="Straße *" id="e-st" value={edit.strasse} onChange={v=>setEdit({...edit,strasse:v})} span2/>
            <Field label="Hausnummer *" id="e-hn" value={edit.hausnummer} onChange={v=>setEdit({...edit,hausnummer:v})}/>
            <Field label="PLZ *" id="e-plz" value={edit.postleitzahl} onChange={v=>setEdit({...edit,postleitzahl:v})}/>
            <Field label="Stadt *" id="e-ct" value={edit.stadt} onChange={v=>setEdit({...edit,stadt:v})} span2/>
            <Field label="Land *" id="e-ld" value={edit.land} onChange={v=>setEdit({...edit,land:v})}/>
            <Field label="ÖÄK-Nr. *" id="e-ok" value={edit.oeak_nr} onChange={v=>setEdit({...edit,oeak_nr:v})}/>
            <div className="col-span-2"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={edit.ist_oegsmp_mitglied} onChange={e=>setEdit({...edit,ist_oegsmp_mitglied:e.target.checked})} className="accent-amber-500"/><span className="text-sm">Aktives ÖGSMP-Mitglied</span></label></div>
          </div>
          <div className="flex gap-3 justify-end"><Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn><Btn onClick={save} disabled={saving}>{saving?'Speichert…':'Speichern'}</Btn></div>
        </Modal>
      )}
    </div>
  )
}

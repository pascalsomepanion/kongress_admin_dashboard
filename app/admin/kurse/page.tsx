'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress,type Kurs}from'@/lib/db'
import{Btn,Loader,Modal,Field,PageHeader,Table}from'@/lib/ui'
export default function KursePage(){
  const[k,setK]=useState<Kongress|null>(null),[kurse,setKurse]=useState<Kurs[]>([]),[loading,setLoading]=useState(true),[edit,setEdit]=useState<Partial<Kurs>|null>(null),[saving,setSaving]=useState(false)
  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);const{data}=await supabase.from('kurse').select('*').eq('kongress_id',k.id).order('sort_order');setKurse((data as Kurs[])??[]);setLoading(false)})},[])
  async function save(){
    if(!edit||!k)return;setSaving(true)
    if(edit.id){await supabase.from('kurse').update(edit).eq('id',edit.id);setKurse(prev=>prev.map(k=>k.id===edit.id?{...k,...edit}as Kurs:k))}
    else{const{data}=await supabase.from('kurse').insert({...edit,kongress_id:k.id}).select().single();if(data)setKurse(prev=>[...prev,data as Kurs])}
    setEdit(null);setSaving(false)
  }
  async function del(id:number){
    const{count}=await supabase.from('buchungen').select('id',{count:'exact',head:true}).eq('kurs_id',id)
    if((count??0)>0){alert('Kurs kann nicht gelöscht werden — es gibt bereits Buchungen.');return}
    if(!confirm('Kurs löschen?'))return
    await supabase.from('kurse').delete().eq('id',id);setKurse(prev=>prev.filter(k=>k.id!==id))
  }
  return(
    <div>
      <PageHeader title="Kursverwaltung"><Btn onClick={()=>setEdit({kurs_gruppe:'ps',nur_als_ganzes:false,sort_order:99})}>+ Kurs anlegen</Btn></PageHeader>
      <div className="p-6">{loading?<Loader/>:(
        <Table headers={['Titel','Datum','Typ','Frühbucher €','Normal €','Mitgl. Früh €','Exklusiv','']} empty={kurse.length===0}>
          {kurse.map(k=>(
            <tr key={k.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-semibold">{k.titel}</td>
              <td className="px-4 py-3 text-xs text-gray-500">{k.wochentag_datum}</td>
              <td className="px-4 py-3 text-xs text-gray-500 uppercase font-mono">{k.kurs_gruppe}</td>
              <td className="px-4 py-3 font-mono text-sm">€ {k.fruehbucher_preis}</td>
              <td className="px-4 py-3 font-mono text-sm">€ {k.spaetbucher_preis}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-500">{k.mitglied_fruehbucher_preis?`€ ${k.mitglied_fruehbucher_preis}`:'—'}</td>
              <td className="px-4 py-3 text-xs text-gray-400">{k.exklusiv_gruppe??'—'}</td>
              <td className="px-4 py-3"><div className="flex gap-1.5"><Btn size="sm" variant="outline" onClick={()=>setEdit({...k})}>Bearbeiten</Btn><Btn size="sm" variant="danger" onClick={()=>del(k.id)}>Löschen</Btn></div></td>
            </tr>
          ))}
        </Table>
      )}</div>
      {edit&&(
        <Modal title={edit.id?'Kurs bearbeiten':'Kurs anlegen'} onClose={()=>setEdit(null)}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Titel *" id="k-ti" value={edit.titel??''} onChange={v=>setEdit({...edit,titel:v})} span2/>
            <Field label="Datum/Wochentag" id="k-dt" value={edit.wochentag_datum??''} onChange={v=>setEdit({...edit,wochentag_datum:v})} span2/>
            <Field label="Uhrzeit (z.B. Mo-Fr, 08:00-09:30 Uhr)" id="k-uz" value={(edit as any).uhrzeit??''} onChange={v=>setEdit({...edit,uhrzeit:v} as any)} span2/>
            <Field label="Untertitel (erscheint auf Bestätigung)" id="k-ut" value={(edit as any).untertitel??''} onChange={v=>setEdit({...edit,untertitel:v} as any)} span2/>
            <Field label="DFP Punkte gesamt" id="k-dfp" value={String((edit as any).dfp_punkte_gesamt??'')} onChange={v=>setEdit({...edit,dfp_punkte_gesamt:parseFloat(v)||null} as any)}/>
            <Field label="Einheiten gesamt" id="k-eg" value={String((edit as any).einheiten_gesamt??1)} onChange={v=>setEdit({...edit,einheiten_gesamt:parseInt(v)||1} as any)}/>
            <Field label="Frühbucher-Preis (€)" id="k-fp" value={String(edit.fruehbucher_preis??'')} onChange={v=>setEdit({...edit,fruehbucher_preis:parseFloat(v)||0})}/>
            <Field label="Normaltarif (€)" id="k-np" value={String(edit.spaetbucher_preis??'')} onChange={v=>setEdit({...edit,spaetbucher_preis:parseFloat(v)||0})}/>
            <Field label="Mitglied Frühbucher (€)" id="k-mf" value={String(edit.mitglied_fruehbucher_preis??'')} onChange={v=>setEdit({...edit,mitglied_fruehbucher_preis:parseFloat(v)||undefined})}/>
            <Field label="Mitglied Normal (€)" id="k-mn" value={String(edit.mitglied_spaetbucher_preis??'')} onChange={v=>setEdit({...edit,mitglied_spaetbucher_preis:parseFloat(v)||undefined})}/>
            <Field label="Exklusiv-Gruppe" id="k-ex" value={edit.exklusiv_gruppe??''} onChange={v=>setEdit({...edit,exklusiv_gruppe:v||null})}/>
            <Field label="Sortierung" id="k-so" value={String(edit.sort_order??0)} onChange={v=>setEdit({...edit,sort_order:parseInt(v)||0})}/>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1.5">Kurs-Gruppe</label>
              <select value={edit.kurs_gruppe??'ps'} onChange={e=>setEdit({...edit,kurs_gruppe:e.target.value as any})} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]">
                <option value="block">Blockkurs</option><option value="ps">Praxisseminar (PS)</option><option value="ts">Theorieseminar (TS)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mt-5"><input type="checkbox" checked={edit.nur_als_ganzes??false} onChange={e=>setEdit({...edit,nur_als_ganzes:e.target.checked})} className="accent-amber-500"/><label className="text-sm">Nur als Ganzes buchbar</label></div>
          </div>
          <div className="flex gap-3 justify-end"><Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn><Btn onClick={save} disabled={saving}>{saving?'Speichert…':'Speichern'}</Btn></div>
        </Modal>
      )}
    </div>
  )
}

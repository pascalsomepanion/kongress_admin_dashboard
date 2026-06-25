'use client'
import{useEffect,useState}from'react'
import{supabase,formatDE,type Kongress}from'@/lib/db'
import{Btn,Badge,Loader,Modal,Field,PageHeader}from'@/lib/ui'
export default function KongressPage(){
  const[list,setList]=useState<Kongress[]>([]),[loading,setLoading]=useState(true),[edit,setEdit]=useState<Partial<Kongress>|null>(null),[saving,setSaving]=useState(false)
  useEffect(()=>{supabase.from('kongresse').select('*').order('jahr',{ascending:false}).then(({data})=>{setList((data as Kongress[])??[]);setLoading(false)})},[])
  async function save(){
    if(!edit)return;setSaving(true)
    if(edit.id){await supabase.from('kongresse').update(edit).eq('id',edit.id);setList(prev=>prev.map(k=>k.id===edit.id?{...k,...edit}as Kongress:k))}
    else{const{data}=await supabase.from('kongresse').insert(edit).select().single();if(data)setList(prev=>[data as Kongress,...prev])}
    setEdit(null);setSaving(false)
  }
  async function setStatus(id:number,status:string){
    if(status==='aktiv')await supabase.from('kongresse').update({status:'archiviert'}).neq('id',id)
    await supabase.from('kongresse').update({status}).eq('id',id)
    const{data}=await supabase.from('kongresse').select('*').order('jahr',{ascending:false});setList((data as Kongress[])??[])
  }
  return(
    <div>
      <PageHeader title="Kongress-Verwaltung"><Btn onClick={()=>setEdit({status:'Planung'})}>+ Neuer Kongress</Btn></PageHeader>
      <div className="p-6 space-y-4">
        {loading?<Loader/>:list.map(k=>(
          <div key={k.id} className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="font-bold text-base">{k.name} {k.jahr}</h2><p className="text-xs text-gray-400 mt-0.5">{k.ort}{k.datum_von&&` · ${formatDE(k.datum_von)} – ${formatDE(k.datum_bis)}`}</p></div>
              <div className="flex items-center gap-3">
                <Badge label={k.status} variant={k.status==='aktiv'?'green':k.status==='archiviert'?'gray':'yellow'}/>
                <Btn size="sm" variant="outline" onClick={()=>setEdit({...k})}>Bearbeiten</Btn>
                {k.status!=='aktiv'&&<Btn size="sm" onClick={()=>setStatus(k.id,'aktiv')}>Als aktiv setzen</Btn>}
                {k.status==='aktiv'&&<Btn size="sm" variant="danger" onClick={()=>setStatus(k.id,'archiviert')}>Archivieren</Btn>}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 text-xs">
              {[['Frühbucher bis',k.fruehbucher_bis?formatDE(k.fruehbucher_bis):'—'],['IBAN',k.iban],['Kontakt',k.kontakt_email],['Storno kostenlos bis',k.storno_kostenlos_bis?formatDE(k.storno_kostenlos_bis):'—']].map(([l,v])=>(
                <div key={l}><span className="text-gray-400">{l}:</span><br/><span className="font-semibold">{v}</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {edit&&(
        <Modal title={edit.id?'Kongress bearbeiten':'Neuer Kongress'} onClose={()=>setEdit(null)} wide>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Field label="Name *" id="c-n" value={edit.name??''} onChange={v=>setEdit({...edit,name:v})} span2/>
            <Field label="Jahr *" id="c-j" value={String(edit.jahr??'')} onChange={v=>setEdit({...edit,jahr:parseInt(v)||undefined})}/>
            <Field label="Ort" id="c-o" value={edit.ort??''} onChange={v=>setEdit({...edit,ort:v})}/>
            <Field label="Datum von (JJJJ-MM-TT)" id="c-dv" value={edit.datum_von??''} onChange={v=>setEdit({...edit,datum_von:v})}/>
            <Field label="Datum bis (JJJJ-MM-TT)" id="c-db" value={edit.datum_bis??''} onChange={v=>setEdit({...edit,datum_bis:v})}/>
            <Field label="Frühbucher bis (JJJJ-MM-TT)" id="c-fb" value={edit.fruehbucher_bis??''} onChange={v=>setEdit({...edit,fruehbucher_bis:v})}/>
            <Field label="Storno kostenlos bis" id="c-sk" value={edit.storno_kostenlos_bis??''} onChange={v=>setEdit({...edit,storno_kostenlos_bis:v})}/>
            <Field label="Storno 50% bis" id="c-s5" value={edit.storno_50_bis??''} onChange={v=>setEdit({...edit,storno_50_bis:v})}/>
            <Field label="IBAN" id="c-ib" value={edit.iban??''} onChange={v=>setEdit({...edit,iban:v})} span2/>
            <Field label="BIC" id="c-bc" value={edit.bic??''} onChange={v=>setEdit({...edit,bic:v})}/>
            <Field label="Kontoinhaber" id="c-ki" value={edit.kontoinhaber??''} onChange={v=>setEdit({...edit,kontoinhaber:v})}/>
            <Field label="Kontakt-Email" id="c-em" value={edit.kontakt_email??''} onChange={v=>setEdit({...edit,kontakt_email:v})} span2 type="email"/>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1.5">Öffnungszeiten Sekretariat</label><textarea value={(edit as any).sekretariat_zeiten??''} onChange={e=>setEdit({...edit,sekretariat_zeiten:e.target.value} as any)} rows={4} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/></div>
            <div className="col-span-2"><label className="block text-xs font-semibold text-gray-500 mb-1.5">Begrüßungstext</label><textarea value={edit.begruessung??''} onChange={e=>setEdit({...edit,begruessung:e.target.value})} rows={3} className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00]"/></div>
          </div>
          <div className="flex gap-3 justify-end"><Btn variant="outline" onClick={()=>setEdit(null)}>Abbrechen</Btn><Btn onClick={save} disabled={saving}>{saving?'Speichert…':'Speichern'}</Btn></div>
        </Modal>
      )}
    </div>
  )
}

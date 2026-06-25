'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Btn,Badge,Loader,PageHeader,Table}from'@/lib/ui'
type B={id:number;gebucht_am:string;gebuchter_preis:number;zahlungsstatus:string;zahlungs_eingang_am:string|null;storniert_am:string|null;teilnehmer:{vorname:string;nachname:string;email:string;oeak_nr:string;ist_oegsmp_mitglied:boolean};kurse:{titel:string}}
const ST:Record<string,{label:string;v:'green'|'yellow'|'red'}>={bezahlt:{label:'Bezahlt',v:'green'},ausstehend:{label:'Ausstehend',v:'yellow'},storniert:{label:'Storniert',v:'red'}}
export default function BuchungenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[list,setList]=useState<B[]>([])
  const[loading,setLoading]=useState(true)
  const[q,setQ]=useState(''),[sf,setSf]=useState('alle')
  useEffect(()=>{getAktuellerKongress().then(async k=>{if(!k){setLoading(false);return};setK(k);const{data}=await supabase.from('buchungen').select('id,gebucht_am,gebuchter_preis,zahlungsstatus,zahlungs_eingang_am,storniert_am,teilnehmer(vorname,nachname,email,oeak_nr,ist_oegsmp_mitglied),kurse(titel)').eq('kongress_id',k.id).order('gebucht_am',{ascending:false});setList((data as unknown as B[])??[]);setLoading(false)})},[])
  async function setStatus(id:number,s:string){
    await supabase.from('buchungen').update({zahlungsstatus:s,zahlungs_eingang_am:s==='bezahlt'?new Date().toISOString():null,storniert_am:s==='storniert'?new Date().toISOString():null}).eq('id',id)
    setList(prev=>prev.map(b=>b.id===id?{...b,zahlungsstatus:s}:b))
  }
  async function updatePreis(id:number,preis:number){
    await supabase.from('buchungen').update({gebuchter_preis:preis}).eq('id',id)
    setList(prev=>prev.map(b=>b.id===id?{...b,gebuchter_preis:preis}:b))
  }
  const filtered=list.filter(b=>{
    const s=q.toLowerCase()
    return(!q||`${b.teilnehmer.vorname} ${b.teilnehmer.nachname} ${b.teilnehmer.email}`.toLowerCase().includes(s))&&(sf==='alle'||b.zahlungsstatus===sf)
  })
  const bezahlt=list.filter(b=>b.zahlungsstatus==='bezahlt').reduce((s,b)=>s+b.gebuchter_preis,0)
  const offen=list.filter(b=>b.zahlungsstatus==='ausstehend').reduce((s,b)=>s+b.gebuchter_preis,0)
  return(
    <div>
      <PageHeader title="Buchungen" sub={`${filtered.length} Einträge · Bezahlt: €${bezahlt.toFixed(2)} · Offen: €${offen.toFixed(2)}`}>
        <input placeholder="Name oder E-Mail…" value={q} onChange={e=>setQ(e.target.value)} className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm w-52 focus:outline-none focus:border-[#FFBF00]"/>
        <div className="flex gap-1">{['alle','ausstehend','bezahlt','storniert'].map(s=><button key={s} onClick={()=>setSf(s)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all ${sf===s?'bg-[#FFBF00] text-black':'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s.charAt(0).toUpperCase()+s.slice(1)}</button>)}</div>
      </PageHeader>
      <div className="p-6">
        {loading?<Loader/>:(
          <Table headers={['Datum','Teilnehmer','Kurs','Preis (€)','Status','Bezahlt am','Aktionen']} empty={filtered.length===0}>
            {filtered.map(b=>{const st=ST[b.zahlungsstatus]??ST['ausstehend'];return(
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{new Date(b.gebucht_am).toLocaleDateString('de-AT')}</td>
                <td className="px-4 py-3 whitespace-nowrap"><div className="font-semibold text-sm">{b.teilnehmer.nachname} {b.teilnehmer.vorname}{b.teilnehmer.ist_oegsmp_mitglied&&<span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">ÖGSMP</span>}</div><div className="text-xs text-gray-400">{b.teilnehmer.email}</div></td>
                <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">{b.kurse.titel}</td>
                <td className="px-4 py-3"><input type="number" defaultValue={b.gebuchter_preis} onBlur={e=>{const v=parseFloat(e.target.value);if(v!==b.gebuchter_preis)updatePreis(b.id,v)}} className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:border-[#FFBF00]"/></td>
                <td className="px-4 py-3"><Badge label={st.label} variant={st.v}/></td>
                <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{b.zahlungs_eingang_am?new Date(b.zahlungs_eingang_am).toLocaleDateString('de-AT'):'—'}</td>
                <td className="px-4 py-3"><div className="flex gap-1.5">
                  {b.zahlungsstatus!=='bezahlt'&&<Btn size="sm" onClick={()=>setStatus(b.id,'bezahlt')}>✓ Bezahlt</Btn>}
                  {b.zahlungsstatus==='bezahlt'&&<Btn size="sm" variant="outline" onClick={()=>setStatus(b.id,'ausstehend')}>Zurücksetzen</Btn>}
                  {b.zahlungsstatus!=='storniert'&&<Btn size="sm" variant="danger" onClick={()=>{if(confirm('Stornieren?'))setStatus(b.id,'storniert')}}>Storno</Btn>}
                </div></td>
              </tr>
            )})}
          </Table>
        )}
      </div>
    </div>
  )
}

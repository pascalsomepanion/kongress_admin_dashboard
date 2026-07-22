'use client'
import{useEffect,useState}from'react'
import{supabase,getAktuellerKongress,type Kongress}from'@/lib/db'
import{Btn,Loader,PageHeader}from'@/lib/ui'

export default function NachrichtenPage(){
  const[k,setK]=useState<Kongress|null>(null)
  const[loading,setLoading]=useState(true)
  const[betreff,setBetreff]=useState('')
  const[text,setText]=useState('')
  const[empfaenger,setEmpfaenger]=useState<{id:number;vorname:string;nachname:string;email:string}[]>([])
  const[sending,setSending]=useState(false)
  const[sent,setSent]=useState<number|null>(null)
  const[error,setError]=useState('')
  const[preview,setPreview]=useState(false)

  useEffect(()=>{getAktuellerKongress().then(async k=>{
    if(!k){setLoading(false);return}
    setK(k)
    const{data}=await supabase.from('teilnehmer').select('id,vorname,nachname,email').eq('kongress_id',k.id).order('nachname')
    setEmpfaenger((data as any[])??[])
    setLoading(false)
  })},[])

  async function send(){
    if(!k||!betreff.trim()||!text.trim())return
    if(!confirm(`Mail an ${empfaenger.length} Teilnehmer senden?`))return
    setSending(true);setError('');setSent(null)
    try{
      const res=await fetch('/api/send-massenmail',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({betreff,text,empfaenger,kongress_name:k.name,kongress_jahr:k.jahr})
      })
      const data=await res.json()
      if(!res.ok)throw new Error(data.error??'Fehler')
      setSent(data.sent??empfaenger.length)
      setBetreff('');setText('')
    }catch(e){
      setError(e instanceof Error?e.message:'Fehler beim Senden')
    }finally{setSending(false)}
  }

  const htmlPreview=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#111;max-width:600px;margin:0 auto;padding:20px;line-height:1.7">
<div style="background:#FFBF00;padding:16px 24px;border-radius:8px 8px 0 0">
  <h1 style="font-size:16px;font-weight:800;color:#111;margin:0">${betreff||'(Betreff)'}</h1>
  <p style="font-size:11px;color:rgba(0,0,0,.5);margin:4px 0 0">${k?.name} ${k?.jahr}</p>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  ${(text||'(Text)').replace(/\n/g,'<br>')}
  <p style="margin-top:24px;color:#6b7280;font-size:12px">Mit sportlichen Grüßen<br><strong>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</strong><br>Kongresspräsident</p>
  <p style="margin-top:12px;font-size:11px;color:#9ca3af">Bei Fragen: <a href="mailto:${k?.kontakt_email}" style="color:#d97706">${k?.kontakt_email}</a></p>
</div></body></html>`

  return(
    <div>
      <PageHeader title="Nachrichten" sub={`Massenmail an alle Teilnehmer`}/>
      <div className="p-6 max-w-3xl">
        {loading?<Loader/>:(
          <div className="space-y-5">

            {/* Info Banner */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-amber-800">Empfänger</p>
                <p className="text-xs text-amber-600 mt-0.5">{empfaenger.length} Teilnehmer für Kongress {k?.jahr}</p>
              </div>
              <span className="text-2xl font-extrabold text-amber-700">{empfaenger.length}</span>
            </div>

            {/* Form */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">Neue Nachricht</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-widest">Betreff</label>
                  <input value={betreff} onChange={e=>setBetreff(e.target.value)}
                    placeholder="z.B. Wichtige Information zum Kongress 2027"
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#FFBF00] transition-all"/>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-widest">Nachricht</label>
                  <textarea value={text} onChange={e=>setText(e.target.value)} rows={10}
                    placeholder="Sehr geehrte Damen und Herren,&#10;&#10;wir möchten Sie informieren, dass..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FFBF00] transition-all resize-none"/>
                  <p className="text-xs text-gray-400 mt-1">Die Anrede, Signatur und Kontaktinformationen werden automatisch hinzugefügt.</p>
                </div>

                {/* Error / Success */}
                {error&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
                {sent!==null&&<div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-semibold">✓ Mail erfolgreich an {sent} Teilnehmer gesendet!</div>}

                <div className="flex gap-3 pt-2">
                  <Btn variant="outline" onClick={()=>setPreview(true)} disabled={!betreff&&!text}>
                    👁 Vorschau
                  </Btn>
                  <Btn onClick={send} disabled={sending||!betreff.trim()||!text.trim()||empfaenger.length===0}>
                    {sending?`Sendet… (${empfaenger.length} Mails)`:`📧 An ${empfaenger.length} Teilnehmer senden`}
                  </Btn>
                </div>
              </div>
            </div>

            {/* Empfängerliste */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">Empfänger ({empfaenger.length})</h2>
              </div>
              <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
                {empfaenger.map(e=>(
                  <div key={e.id} className="flex justify-between px-5 py-2.5 text-sm">
                    <span className="font-medium text-gray-800">{e.nachname} {e.vorname}</span>
                    <span className="text-gray-400 text-xs">{e.email}</span>
                  </div>
                ))}
                {empfaenger.length===0&&<div className="px-5 py-8 text-center text-sm text-gray-400">Noch keine Teilnehmer angemeldet</div>}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* VORSCHAU */}
      {preview&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold">Vorschau — {betreff||'(kein Betreff)'}</h2>
              <Btn variant="outline" onClick={()=>setPreview(false)}>← Schließen</Btn>
            </div>
            <iframe srcDoc={htmlPreview} className="flex-1 w-full rounded-b-2xl" style={{minHeight:'60vh'}}/>
          </div>
        </div>
      )}
    </div>
  )
}

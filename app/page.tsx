'use client'
import { useEffect, useState } from 'react'
import { supabase, getAktuellerKongress, getKurse, emailExists, getPreis, isFruehbucher, formatDE, formatDatum, type Kongress, type Kurs } from '@/lib/db'

type FormData = {
  vorname:string;nachname:string;strasse:string;hausnummer:string
  stadt:string;postleitzahl:string;land:string;oeak_nr:string
  email:string;ist_oegsmp_mitglied:boolean
}
type Step='form'|'confirm'|'done'
type Errors=Partial<Record<keyof FormData|'kurse',string>>
const EMPTY:FormData={vorname:'',nachname:'',strasse:'',hausnummer:'',stadt:'',postleitzahl:'',land:'Österreich',oeak_nr:'',email:'',ist_oegsmp_mitglied:false}

export default function AnmeldungPage(){
  const[kongress,setKongress]=useState<Kongress|null>(null)
  const[kurse,setKurse]=useState<Kurs[]>([])
  const[selected,setSelected]=useState<Set<number>>(new Set())
  const[form,setForm]=useState<FormData>(EMPTY)
  const[step,setStep]=useState<Step>('form')
  const[errors,setErrors]=useState<Errors>({})
  const[konflikt,setKonflikt]=useState('')
  const[duplikat,setDuplikat]=useState(false)
  const[pageLoading,setPageLoading]=useState(true)
  const[checkLoading,setCheckLoading]=useState(false)
  const[submitLoading,setSubmitLoading]=useState(false)
  const[submitError,setSubmitError]=useState('')

  useEffect(()=>{
    getAktuellerKongress().then(k=>{
      if(k){setKongress(k);getKurse(k.id).then(setKurse)}
      setPageLoading(false)
    })
  },[])

  const frueh=kongress?isFruehbucher(kongress):false
  const gesamtbetrag=Array.from(selected).reduce((s,id)=>{
    const k=kurse.find(k=>k.id===id);return k?s+getPreis(k,form.ist_oegsmp_mitglied,frueh):s
  },0)
  const blockKurse=kurse.filter(k=>k.kurs_gruppe==='block')
  const psKurse=kurse.filter(k=>k.kurs_gruppe==='ps')
  const tsKurse=kurse.filter(k=>k.kurs_gruppe==='ts')

  function getKonfliktIds(kurs:Kurs):number[]{
    const result:number[]=[]
    const num=parseInt(kurs.titel.replace(/\D/g,''))
    if(isNaN(num))return result
    const pendant=kurse.find(k=>k.id!==kurs.id&&['ps','ts'].includes(k.kurs_gruppe)&&k.kurs_gruppe!==kurs.kurs_gruppe&&parseInt(k.titel.replace(/\D/g,''))===num)
    if(pendant)result.push(pendant.id)
    const pairNum=num%2===1?num+1:num-1
    const pair=kurse.find(k=>k.id!==kurs.id&&k.kurs_gruppe===kurs.kurs_gruppe&&parseInt(k.titel.replace(/\D/g,''))===pairNum)
    if(pair)result.push(pair.id)
    return result
  }

  function toggleKurs(kurs:Kurs){
    const next=new Set(selected)
    if(next.has(kurs.id)){next.delete(kurs.id);setKonflikt('');setSelected(next);return}
    if(kurs.exklusiv_gruppe){
      const clash=kurse.find(k=>k.exklusiv_gruppe===kurs.exklusiv_gruppe&&next.has(k.id))
      if(clash){setKonflikt(`"${kurs.titel}" und "${clash.titel}" können nicht gleichzeitig gebucht werden.`);return}
    }
    getKonfliktIds(kurs).forEach(id=>next.delete(id))
    setKonflikt('');next.add(kurs.id);setSelected(next)
    if(errors.kurse)setErrors(p=>({...p,kurse:''}))
  }

  function setF<K extends keyof FormData>(key:K,value:FormData[K]){
    setForm(p=>({...p,[key]:value}))
    if(errors[key])setErrors(p=>({...p,[key]:''}))
  }

  function validate():boolean{
    const errs:Errors={}
    const req:[keyof FormData,string][]=[
      ['vorname','Vorname fehlt'],['nachname','Nachname fehlt'],['strasse','Straße fehlt'],
      ['hausnummer','Hausnummer fehlt'],['postleitzahl','PLZ fehlt'],['stadt','Stadt fehlt'],
      ['land','Land fehlt'],['oeak_nr','ÖÄK-Nr. fehlt'],['email','E-Mail fehlt'],
    ]
    req.forEach(([f,msg])=>{if(!(form[f] as string).trim())errs[f]=msg})
    if(form.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))errs.email='Ungültige E-Mail-Adresse'
    if(selected.size===0)errs.kurse='Bitte mindestens einen Kurs auswählen'
    setErrors(errs);return Object.keys(errs).length===0
  }

  async function goConfirm(){
    if(!validate()||!kongress)return
    setCheckLoading(true)
    const exists=await emailExists(form.email.trim(),kongress.id)
    setCheckLoading(false)
    if(exists){setDuplikat(true);setErrors(p=>({...p,email:'Diese E-Mail ist bereits registriert'}));document.getElementById('f-email')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    setDuplikat(false);setStep('confirm');window.scrollTo({top:0,behavior:'smooth'})
  }

  async function submit(){
    if(!kongress)return
    setSubmitLoading(true);setSubmitError('')
    try{
      const{data:tn,error:e1}=await supabase.from('teilnehmer').insert({
        vorname:form.vorname.trim(),nachname:form.nachname.trim(),strasse:form.strasse.trim(),hausnummer:form.hausnummer.trim(),
        stadt:form.stadt.trim(),postleitzahl:form.postleitzahl.trim(),land:form.land.trim(),oeak_nr:form.oeak_nr.trim(),
        email:form.email.trim().toLowerCase(),ist_oegsmp_mitglied:form.ist_oegsmp_mitglied,
        kongress_id:kongress.id,registriert_am:new Date().toISOString(),
      }).select('id').single()
      if(e1)throw new Error(e1.message)
      const buchungen=Array.from(selected).map(kurs_id=>{
        const k=kurse.find(k=>k.id===kurs_id)!
        return{teilnehmer_id:tn.id,kurs_id,gebuchter_preis:getPreis(k,form.ist_oegsmp_mitglied,frueh),zahlungsstatus:'ausstehend',kongress_id:kongress.id,gebucht_am:new Date().toISOString()}
      })
      const{error:e2}=await supabase.from('buchungen').insert(buchungen)
      if(e2)throw new Error(e2.message)
      const gebuchteKurse=Array.from(selected).map(id=>{const k=kurse.find(k=>k.id===id)!;return{titel:k.titel,uhrzeit:k.uhrzeit??'',preis:getPreis(k,form.ist_oegsmp_mitglied,frueh)}})
      await fetch('/api/send-confirmation',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          email:form.email.trim(),vorname:form.vorname,nachname:form.nachname,strasse:form.strasse,hausnummer:form.hausnummer,
          postleitzahl:form.postleitzahl,stadt:form.stadt,land:form.land,oeak_nr:form.oeak_nr,ist_oegsmp_mitglied:form.ist_oegsmp_mitglied,
          kongress_name:kongress.name,kongress_jahr:kongress.jahr,kongress_datum:formatDatum(kongress.datum_von,kongress.datum_bis),
          kongress_start:new Date(kongress.datum_von).toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 15:00 Uhr',
          kongress_ende:new Date(kongress.datum_bis).toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 19:00 Uhr',
          iban:kongress.iban,bic:kongress.bic,kontoinhaber:kongress.kontoinhaber,kontakt_email:kongress.kontakt_email,
          fruehbucher_bis:formatDE(kongress.fruehbucher_bis),storno_kostenlos_bis:formatDE(kongress.storno_kostenlos_bis),storno_50_bis:formatDE(kongress.storno_50_bis),
          sekretariat_zeiten:(kongress as any).sekretariat_zeiten??'',gebuchte_kurse:gebuchteKurse,gesamtbetrag,
        }),
      })
      setStep('done');window.scrollTo({top:0,behavior:'smooth'})
    }catch(e){
      setSubmitError(e instanceof Error?e.message:'Fehler. Bitte versuchen Sie es erneut.')
    }finally{setSubmitLoading(false)}
  }

  if(pageLoading)return(
    <div style={{minHeight:'100vh',backgroundImage:'url(/hero.jpg)',backgroundSize:'cover',backgroundPosition:'center',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{position:'absolute',inset:0,background:'rgba(10,22,40,0.7)'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{position:'relative',textAlign:'center'}}>
        <div style={{width:36,height:36,border:'3px solid rgba(255,200,3,0.2)',borderTop:'3px solid #ffc803',borderRadius:'50%',animation:'spin 0.9s linear infinite',margin:'0 auto 16px'}}/>
        <p style={{color:'rgba(255,255,255,0.5)',fontSize:12,letterSpacing:'0.2em'}}>LADEN</p>
      </div>
    </div>
  )

  if(!kongress)return(
    <div style={{minHeight:'100vh',background:'#0a1628',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:'rgba(255,255,255,0.3)'}}>Kein aktiver Kongress gefunden.</p>
    </div>
  )

  const fruehText=formatDE(kongress.fruehbucher_bis)
  const stornoFreeText=formatDE(kongress.storno_kostenlos_bis)
  const storno50Text=formatDE(kongress.storno_50_bis)
  const fullName=`${form.vorname} ${form.nachname}`.trim()

  // Glass card style
  const glass:React.CSSProperties={
    background:'rgba(255,255,255,0.92)',
    backdropFilter:'blur(20px)',
    WebkitBackdropFilter:'blur(20px)',
    borderRadius:20,
    border:'1px solid rgba(255,255,255,0.6)',
    boxShadow:'0 8px 40px rgba(10,22,40,0.18)',
    overflow:'hidden',
  }
  const glassDark:React.CSSProperties={
    background:'rgba(10,22,40,0.75)',
    backdropFilter:'blur(20px)',
    WebkitBackdropFilter:'blur(20px)',
    borderRadius:20,
    border:'1px solid rgba(255,200,3,0.15)',
    boxShadow:'0 8px 40px rgba(10,22,40,0.3)',
  }

  return(
    <div style={{
      minHeight:'100vh',
      backgroundImage:'url(/hero.jpg)',
      backgroundSize:'cover',
      backgroundPosition:'center',
      backgroundAttachment:'fixed',
      position:'relative',
    }}>
      {/* Dark overlay */}
      <div style={{position:'fixed',inset:0,background:'linear-gradient(160deg,rgba(10,22,40,0.55) 0%,rgba(10,22,40,0.45) 50%,rgba(10,22,40,0.6) 100%)',zIndex:0}}/>

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fi:focus{border-color:#ffc803!important;box-shadow:0 0 0 3px rgba(255,200,3,0.12)!important;background:rgba(255,255,255,0.08)!important;outline:none}
        .fi:-webkit-autofill,.fi:-webkit-autofill:hover,.fi:-webkit-autofill:focus{-webkit-box-shadow:0 0 0 1000px rgba(20,35,58,0.95) inset!important;-webkit-text-fill-color:rgba(255,255,255,0.9)!important;border-color:rgba(255,255,255,0.15)!important;transition:background-color 5000s ease-in-out 0s}
        .krow:hover{border-color:rgba(255,200,3,0.4)!important}
        .krow.sel{border-color:rgba(255,200,3,0.6)!important;background:rgba(255,200,3,0.06)!important}
        .ghost-btn:hover{background:rgba(255,255,255,0.1)!important}
        @media(max-width:600px){
          .hero-title{font-size:1.5rem!important;letter-spacing:0.05em!important}
          .hero-sub{font-size:0.85rem!important}
          .grid2{grid-template-columns:1fr!important}
          .psgrid{grid-template-columns:1fr!important}
          .steplabel{display:none!important}
          .confirmbtn{flex-direction:column!important}
        }
      `}</style>

      {/* STICKY HEADER */}
      <div style={{
        position:'sticky',top:0,zIndex:100,
        background:'rgba(10,22,40,0.45)',
        backdropFilter:'blur(24px)',
        WebkitBackdropFilter:'blur(24px)',
        borderBottom:'1px solid rgba(255,200,3,0.12)',
        animation:'fadeDown 0.5s ease',
      }}>
        <div style={{maxWidth:760,margin:'0 auto',padding:'0 20px',boxSizing:'border-box'}}>
          {/* TOP: Anmeldung badge */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',paddingTop:14,paddingBottom:6}}>
            <div style={{
              display:'inline-flex',alignItems:'center',gap:8,
              background:'rgba(255,200,3,0.12)',border:'1px solid rgba(255,200,3,0.25)',
              borderRadius:100,padding:'4px 14px',
            }}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#ffc803'}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.22em',textTransform:'uppercase' as const,color:'#ffc803'}}>
                Anmeldung {kongress.jahr}
              </span>
            </div>
          </div>
          {/* MIDDLE: Kongress name */}
          <div style={{textAlign:'center',paddingBottom:10}}>
            <h1 style={{fontSize:'clamp(0.9rem,2.5vw,1.15rem)',fontWeight:700,color:'rgba(255,255,255,0.92)',letterSpacing:'0.04em',lineHeight:1.3}}>
              {kongress.name}
            </h1>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginTop:3,letterSpacing:'0.08em'}}>
              {kongress.ort} · {new Date(kongress.datum_von).toLocaleDateString('de-AT')} – {new Date(kongress.datum_bis).toLocaleDateString('de-AT')}
            </p>
          </div>

        </div>
      </div>

      {/* CONTENT */}
      <div style={{position:'relative',zIndex:1,maxWidth:760,margin:'0 auto',padding:'28px 20px 56px',display:'flex',flexDirection:'column' as const,gap:16,animation:'fadeUp 0.6s ease'}}>

        {/* ── STEP 1 ── */}
        {step==='form'&&<>
          {/* INFO */}
          <div className="grid2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{background:'rgba(255,200,3,0.1)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,200,3,0.25)',borderRadius:20,padding:'20px 20px',boxShadow:'0 4px 24px rgba(10,22,40,0.12)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{marginBottom:10}}><circle cx="16" cy="12" r="7" stroke="#ffc803" strokeWidth="2"/><path d="M10 19c-3 1.5-5 4-5 7h22c0-3-2-5.5-5-7" stroke="#ffc803" strokeWidth="2" strokeLinecap="round"/><path d="M16 5V2M21 7l2-2M11 7L9 5" stroke="#ffc803" strokeWidth="1.5" strokeLinecap="round"/><circle cx="16" cy="12" r="2.5" fill="#ffc803"/></svg>
              <p style={{fontSize:12,fontWeight:800,letterSpacing:'0.12em',textTransform:'uppercase' as const,color:'#ffc803',marginBottom:8}}>Frühbucherbonus</p>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.8)',lineHeight:1.7}}>Zahlungseingang bis {fruehText}. Ab dem Folgetag gilt der Normaltarif.</p>
            </div>
            <div style={{background:'rgba(255,200,3,0.1)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,200,3,0.25)',borderRadius:20,padding:'20px 20px',boxShadow:'0 4px 24px rgba(10,22,40,0.12)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{marginBottom:10}}><rect x="6" y="4" width="20" height="24" rx="3" stroke="#ffc803" strokeWidth="2"/><path d="M11 12h10M11 17h7" stroke="#ffc803" strokeWidth="1.5" strokeLinecap="round"/><path d="M19 21l2 2 4-4" stroke="#ffc803" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <p style={{fontSize:12,fontWeight:800,letterSpacing:'0.12em',textTransform:'uppercase' as const,color:'#ffc803',marginBottom:8}}>Stornogebühren</p>
              <p style={{fontSize:12,color:'rgba(255,255,255,0.8)',lineHeight:1.7}}>Bis {stornoFreeText}: kostenlos · Bis {storno50Text}: 50% · Danach: keine Erstattung</p>
            </div>
          </div>

          {/* PREISTABELLE */}
          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',overflow:'hidden'}}>
            <div style={{background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,200,3,0.1)',padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'}}>Preisübersicht</span>
            </div>
            <div style={{padding:'4px 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                <thead>
                  <tr>{['Kurs','Datum & Zeit','Frühbucher','Normal'].map((h,i)=>(
                    <th key={h} style={{padding:'12px 0 8px',textAlign:i>1?'right' as const:'left' as const,fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.4)',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  <tr><td colSpan={4} style={{padding:'12px 0 4px',fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'#c99a00'}}>Blockkurse</td></tr>
                  {blockKurse.map(k=>(
                    <tr key={k.id} style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                      <td style={{padding:'9px 0',fontWeight:600,color:'rgba(255,255,255,0.9)'}}>
                        <div>{k.titel}</div>
                        {k.mitglied_fruehbucher_preis&&k.titel.toLowerCase().includes('suckert')&&
                          <div style={{marginTop:3}}><span style={{fontSize:9,color:'#60a5fa',fontWeight:700,background:'rgba(96,165,250,0.15)',padding:'2px 8px',borderRadius:4,border:'1px solid rgba(96,165,250,0.2)'}}>ÖGSMP −€20</span></div>}
                      </td>
                      <td style={{padding:'9px 0',color:'#9ca3af',fontSize:11}}>{k.uhrzeit??k.wochentag_datum}</td>
                      <td style={{padding:'9px 0',textAlign:'right' as const,fontWeight:700,color:'rgba(255,255,255,0.9)'}}>€ {k.fruehbucher_preis}</td>
                      <td style={{padding:'9px 0',textAlign:'right' as const,fontWeight:700,color:'#c99a00'}}>€ {k.spaetbucher_preis}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} style={{padding:'12px 0 4px',fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'#c99a00'}}>Praxis- & Theorieseminare</td></tr>
                  {psKurse.map((k,i)=>{const ts=tsKurse[i];return(
                    <tr key={k.id} style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                      <td style={{padding:'9px 0',color:'rgba(255,255,255,0.8)'}}>{k.titel} / {ts?.titel}</td>
                      <td style={{padding:'9px 0',color:'#9ca3af',fontSize:11}}>{k.uhrzeit??k.wochentag_datum}</td>
                      <td style={{padding:'9px 0',textAlign:'right' as const,fontWeight:700,color:'rgba(255,255,255,0.9)'}}>€ {k.fruehbucher_preis}</td>
                      <td style={{padding:'9px 0',textAlign:'right' as const,fontWeight:700,color:'#c99a00'}}>€ {k.spaetbucher_preis}</td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>

          {/* HINWEISE */}
          <div style={{background:'rgba(255,200,3,0.08)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:'1px solid rgba(255,200,3,0.2)',borderRadius:20,padding:'22px 24px',boxShadow:'0 4px 24px rgba(10,22,40,0.12)'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{flexShrink:0}}><path d="M14 3L26 24H2L14 3Z" stroke="#ffc803" strokeWidth="2" strokeLinejoin="round"/><path d="M14 11v6" stroke="#ffc803" strokeWidth="2" strokeLinecap="round"/><circle cx="14" cy="20" r="1.2" fill="#ffc803"/></svg>
              <p style={{fontSize:13,fontWeight:800,letterSpacing:'0.12em',textTransform:'uppercase' as const,color:'#ffc803'}}>Wichtige Hinweise</p>
            </div>
            {['GK LIP und Work-Shop finden gleichzeitig statt — nur eines buchbar','PS und TS laufen parallel — tageweiser Wechsel möglich (PS1=PS2 usw.)','Ski Alpin & Ärztesport über Ski Austria Akademie — im Zimmerpreis inkl.','Steuerliche Absetzbarkeit bei mind. 8 Std. Nachweis'].map((h,i)=>(
              <div key={i} style={{display:'flex',gap:10,padding:'6px 0',alignItems:'flex-start'}}>
                <span style={{color:'#ffc803',fontWeight:700,fontSize:14,flexShrink:0,marginTop:1}}>→</span>
                <p style={{fontSize:13,color:'rgba(255,255,255,0.85)',lineHeight:1.6}}>{h}</p>
              </div>
            ))}
          </div>

          {/* PERSÖNLICHE DATEN */}
          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',overflow:'hidden'}}>
            <div style={{background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,200,3,0.1)',padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'}}>Persönliche Daten</span>
            </div>
            <div style={{padding:24,display:'flex',flexDirection:'column' as const,gap:12}}>
              <div className="grid2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <FI label="Vorname *" id="f-vn" value={form.vorname} onChange={v=>setF('vorname',v)} error={errors.vorname}/>
                <FI label="Nachname *" id="f-nn" value={form.nachname} onChange={v=>setF('nachname',v)} error={errors.nachname}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px',gap:12}}>
                <FI label="Straße *" id="f-st" value={form.strasse} onChange={v=>setF('strasse',v)} error={errors.strasse}/>
                <FI label="Nr. *" id="f-hn" value={form.hausnummer} onChange={v=>setF('hausnummer',v)} error={errors.hausnummer}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'100px 1fr',gap:12}}>
                <FI label="PLZ *" id="f-plz" value={form.postleitzahl} onChange={v=>setF('postleitzahl',v)} error={errors.postleitzahl}/>
                <FI label="Stadt *" id="f-ct" value={form.stadt} onChange={v=>setF('stadt',v)} error={errors.stadt}/>
              </div>
              <FI label="Land *" id="f-ld" value={form.land} onChange={v=>setF('land',v)} error={errors.land}/>
              <FI label="ÖÄK-Nr. * (internationale Gäste: 0)" id="f-ok" value={form.oeak_nr} onChange={v=>setF('oeak_nr',v)} error={errors.oeak_nr}/>
              <div id="f-email"><FI label="E-Mail *" id="f-em" type="email" value={form.email} onChange={v=>{setF('email',v);setDuplikat(false)}} error={errors.email}/></div>
              {duplikat&&<div style={{background:'rgba(37,99,235,0.06)',border:'1px solid rgba(37,99,235,0.18)',borderRadius:10,padding:'12px 14px',fontSize:13,color:'#1d4ed8',lineHeight:1.6}}>Diese E-Mail ist bereits registriert. Bei Änderungswünschen: <a href={`mailto:${kongress.kontakt_email}`} style={{fontWeight:700,textDecoration:'underline'}}>{kongress.kontakt_email}</a></div>}
              <label style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,border:`1.5px solid ${form.ist_oegsmp_mitglied?'rgba(255,200,3,0.5)':'rgba(255,255,255,0.1)'}`,background:form.ist_oegsmp_mitglied?'rgba(255,200,3,0.08)':'rgba(255,255,255,0.04)',cursor:'pointer',transition:'all 0.2s'}}>
                <input type="checkbox" checked={form.ist_oegsmp_mitglied} onChange={e=>setF('ist_oegsmp_mitglied',e.target.checked)} style={{width:16,height:16,accentColor:'#ffc803',flexShrink:0}}/>
                <div>
                  <p style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.9)'}}>Aktives ÖGSMP-Mitglied</p>
                  <p style={{fontSize:11,color:'#6b7280',marginTop:2}}>Rabatt beim Reinhard Suckert Symposium (−€ 20)</p>
                </div>
              </label>
            </div>
          </div>

          {/* KURSAUSWAHL */}
          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',overflow:'hidden'}}>
            <div style={{background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,200,3,0.1)',padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'}}>Kursauswahl</span>
            </div>
            <div style={{padding:24}}>
              {konflikt&&<div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#dc2626',marginBottom:14}}>⚠ {konflikt}</div>}
              {errors.kurse&&<div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'10px 14px',fontSize:13,color:'#dc2626',marginBottom:14}}>⚠ {errors.kurse}</div>}
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.4)',marginBottom:12}}>Blockkurse</p>
              {blockKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)}/>)}
              <div style={{borderTop:'1px solid rgba(255,255,255,0.08)',margin:'16px 0'}}/>
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.4)',marginBottom:4}}>Praxis- & Theorieseminare</p>
              <p style={{fontSize:12,color:'#9ca3af',marginBottom:14}}>PS und TS laufen parallel — tageweiser Wechsel möglich</p>
              <div className="psgrid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'#4b5563',marginBottom:10}}>Praxisseminare</p>
                  {psKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'#4b5563',marginBottom:10}}>Theorieseminare</p>
                  {tsKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
              </div>
            </div>
          </div>

          {/* SUMME */}
          {selected.size>0&&(
            <div style={{...glassDark,padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginBottom:4}}>{selected.size} Kurs{selected.size!==1?'e':''} ausgewählt</p>
                <p style={{fontSize:28,fontWeight:800,color:'#fff',letterSpacing:'-0.02em'}}>€ {gesamtbetrag.toFixed(2)}</p>
              </div>
              {frueh
                ?<div style={{textAlign:'right' as const}}>
                  <div style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,200,3,0.12)',border:'1px solid rgba(255,200,3,0.25)',borderRadius:100,padding:'5px 12px',fontSize:10,fontWeight:700,color:'#ffc803',letterSpacing:'0.1em'}}>
                    Frühbucherpreis
                  </div>
                  <p style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginTop:6}}>bis {fruehText}</p>
                </div>
                :<div style={{display:'inline-flex',alignItems:'center',background:'rgba(255,255,255,0.06)',borderRadius:100,padding:'5px 12px',fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.3)'}}>Normaltarif</div>
              }
            </div>
          )}

          <GoldBtn onClick={goConfirm} disabled={checkLoading}>{checkLoading?'Wird geprüft…':'Weiter zur Überprüfung →'}</GoldBtn>
        </>}

        {/* ── STEP 2 ── */}
        {step==='confirm'&&<>
          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',overflow:'hidden'}}>
            <div style={{background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,200,3,0.1)',padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'}}>Persönliche Daten</span>
            </div>
            <div style={{padding:'4px 24px 16px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                {[['Vorname',form.vorname],['Nachname',form.nachname],['Straße',`${form.strasse} ${form.hausnummer}`],['PLZ / Stadt',`${form.postleitzahl} ${form.stadt}`],['Land',form.land],['ÖÄK-Nr.',form.oeak_nr],['E-Mail',form.email],...(form.ist_oegsmp_mitglied?[['ÖGSMP-Mitglied','Ja']]:[])].map(([l,v])=>(
                  <div key={l} style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                    <p style={{fontSize:10,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.35)',marginBottom:4}}>{l}</p>
                    <p style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.9)'}}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',overflow:'hidden'}}>
            <div style={{background:'rgba(0,0,0,0.2)',borderBottom:'1px solid rgba(255,200,3,0.1)',padding:'16px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'}}>Gebuchte Kurse</span>
            </div>
            <div style={{padding:'4px 24px 16px'}}>
              {Array.from(selected).map(id=>{
                const k=kurse.find(k=>k.id===id)!;const p=getPreis(k,form.ist_oegsmp_mitglied,frueh)
                return(
                  <div key={id} style={{padding:'11px 0',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.9)'}}>{k.titel}</span>
                      <span style={{fontSize:13,fontWeight:700,flexShrink:0,marginLeft:16,color:'rgba(255,255,255,0.9)'}}>€ {p.toFixed(2)}</span>
                    </div>
                    {k.uhrzeit&&<p style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginTop:3}}>{k.uhrzeit}</p>}
                  </div>
                )
              })}
              <div style={{display:'flex',justifyContent:'space-between',padding:'14px 0 0',fontWeight:800,fontSize:15}}>
                <span style={{color:'rgba(255,255,255,0.7)'}}>Gesamtbetrag</span>
                <span style={{color:'#c99a00'}}>€ {gesamtbetrag.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{...glassDark,padding:24}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <div style={{width:3,height:14,background:'#ffc803',borderRadius:2}}/>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,200,3,0.6)'}}>Zahlung</span>
            </div>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.6)',marginBottom:18,lineHeight:1.6}}>Bitte überweisen Sie nach der Anmeldung. Nach Zahlungseingang erhalten Sie eine Rechnung per E-Mail.</p>
            <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,200,3,0.1)',borderRadius:12,padding:'16px'}}>
              {[['IBAN',kongress.iban,false],['BIC',kongress.bic,false],['Kontoinhaber',kongress.kontoinhaber,false],['Verwendungszweck',fullName,false],['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0',alignItems:'baseline'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.4)',width:128,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color:hi?'#ffc803':'rgba(255,255,255,0.88)'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {submitError&&<div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'12px 16px',fontSize:13,color:'#dc2626'}}>{submitError}</div>}

          <div className="confirmbtn" style={{display:'flex',gap:12}}>
            <button onClick={()=>{setStep('form');window.scrollTo({top:0,behavior:'smooth'})}} style={{
              flex:1,background:'rgba(255,255,255,0.85)',backdropFilter:'blur(10px)',
              border:'1px solid rgba(255,255,255,0.4)',color:'#374151',
              fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:600,fontSize:14,
              padding:'14px',borderRadius:14,cursor:'pointer',
            }}>← Zurück</button>
            <GoldBtn onClick={submit} disabled={submitLoading} style={{flex:2}}>{submitLoading?'Wird gespeichert…':'Jetzt verbindlich anmelden'}</GoldBtn>
          </div>
        </>}

        {/* ── STEP 3 ── */}
        {step==='done'&&(
          <div style={{background:'rgba(20,35,58,0.72)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRadius:20,border:'1px solid rgba(255,200,3,0.15)',boxShadow:'0 8px 40px rgba(10,22,40,0.25)',padding:'48px 32px',textAlign:'center' as const}}>
            <div style={{width:64,height:64,background:'rgba(34,197,94,0.1)',border:'2px solid rgba(34,197,94,0.25)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px',fontSize:26,color:'#16a34a'}}>✓</div>
            <h2 style={{fontSize:22,fontWeight:800,color:'rgba(255,255,255,0.95)',marginBottom:10}}>Anmeldung eingegangen!</h2>
            <p style={{fontSize:14,color:'rgba(255,255,255,0.55)',marginBottom:28,lineHeight:1.7}}>Danke, {form.vorname}! Eine Bestätigung wurde an <strong style={{color:'rgba(255,255,255,0.9)'}}>{form.email}</strong> gesendet.</p>
            <div style={{...glassDark,padding:'20px 24px',textAlign:'left' as const,marginBottom:20}}>
              {[['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true],['IBAN',kongress.iban,false],['BIC',kongress.bic,false],['Verwendungszweck',fullName,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',width:120,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color:hi?'#ffc803':'rgba(255,255,255,0.88)'}}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>Fragen? <a href={`mailto:${kongress.kontakt_email}`} style={{color:'#c99a00',fontWeight:600}}>{kongress.kontakt_email}</a></p>
          </div>
        )}

        <p style={{textAlign:'center' as const,fontSize:11,color:'rgba(255,255,255,0.35)',paddingBottom:8}}>
          Prof. h.c. Univ.-Doz. Dr. Günther Neumayr · <a href={`mailto:${kongress.kontakt_email}`} style={{color:'rgba(255,200,3,0.6)'}}>{kongress.kontakt_email}</a>
        </p>
      </div>
    </div>
  )
}

function FI({label,id,value,onChange,type='text',error}:{label:string;id:string;value:string;onChange:(v:string)=>void;type?:string;error?:string}){
  return(
    <div>
      <label htmlFor={id} style={{display:'block',fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'0.04em'}}>{label}</label>
      <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} autoComplete="off" className="fi"
        style={{width:'100%',background:'rgba(255,255,255,0.08)',border:'1.5px solid rgba(255,255,255,0.15)',borderRadius:10,padding:'10px 13px',fontSize:14,color:'rgba(255,255,255,0.9)',outline:'none',fontFamily:'Plus Jakarta Sans, sans-serif',transition:'all 0.2s'}}
      />
      {error&&<p style={{fontSize:11,color:'#dc2626',marginTop:4,fontWeight:500}}>{error}</p>}
    </div>
  )
}

function KursRow({kurs,selected,preis,onToggle,compact}:{kurs:Kurs;selected:boolean;preis:number;onToggle:()=>void;compact?:boolean}){
  return(
    <label className={`krow${selected?' sel':''}`} style={{
      display:'flex',alignItems:'center',gap:12,cursor:'pointer',
      borderRadius:10,border:`1.5px solid ${selected?'rgba(255,200,3,0.5)':'rgba(255,255,255,0.08)'}`,
      padding:compact?'9px 11px':'12px 13px',marginBottom:7,
      background:selected?'rgba(255,200,3,0.08)':'rgba(255,255,255,0.04)',
      transition:'all 0.2s',
    }}>
      <input type="checkbox" checked={selected} onChange={onToggle} style={{width:15,height:15,accentColor:'#ffc803',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:compact?12:13,fontWeight:600,color:'rgba(255,255,255,0.88)'}}>{kurs.titel}</p>
        <p style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{kurs.uhrzeit??kurs.wochentag_datum}</p>
      </div>
      <span style={{fontSize:compact?12:13,fontWeight:700,color:'#ffc803',flexShrink:0}}>€ {preis}</span>
    </label>
  )
}

function GoldBtn({onClick,children,disabled,style}:{onClick?:()=>void;children:React.ReactNode;disabled?:boolean;style?:React.CSSProperties}){
  return(
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex',alignItems:'center',justifyContent:'center',gap:8,width:'100%',
      background:'#ffc803',border:'none',color:'#0a1628',
      fontFamily:'Plus Jakarta Sans, sans-serif',fontWeight:700,fontSize:14,letterSpacing:'0.03em',
      padding:'15px 24px',borderRadius:14,cursor:disabled?'not-allowed':'pointer',
      boxShadow:'0 4px 20px rgba(255,200,3,0.3)',transition:'all 0.2s',
      opacity:disabled?0.6:1,...style,
    }}>
      {children}
    </button>
  )
}

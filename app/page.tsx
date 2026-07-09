'use client'
import { useEffect, useState } from 'react'
import { supabase, getAktuellerKongress, getKurse, emailExists, getPreis, isFruehbucher, formatDE, formatDatum, type Kongress, type Kurs } from '@/lib/db'

type FormData = {
  vorname:string; nachname:string; strasse:string; hausnummer:string
  stadt:string; postleitzahl:string; land:string; oeak_nr:string
  email:string; ist_oegsmp_mitglied:boolean
}
type Step = 'form'|'confirm'|'done'
type Errors = Partial<Record<keyof FormData|'kurse',string>>
const EMPTY:FormData = {vorname:'',nachname:'',strasse:'',hausnummer:'',stadt:'',postleitzahl:'',land:'Österreich',oeak_nr:'',email:'',ist_oegsmp_mitglied:false}

const S:Record<string,React.CSSProperties> = {
  card:{background:'var(--white)',borderRadius:'var(--radius-lg)',border:'1px solid var(--border)',boxShadow:'var(--shadow-sm)',overflow:'hidden'},
  cardHeader:{background:'var(--navy)',padding:'18px 24px',display:'flex',alignItems:'center',gap:10},
  cardHeaderText:{fontSize:10,fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.5)'},
  cardBody:{padding:'24px'},
  label:{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:6,display:'block',letterSpacing:'0.04em'},
  input:{width:'100%',background:'var(--off-white)',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 13px',fontSize:14,color:'var(--text)',outline:'none',fontFamily:'var(--font)',transition:'var(--transition)'},
  row:{display:'flex',gap:12},
  accentBar:{width:3,height:16,background:'var(--gold)',borderRadius:2,flexShrink:0},
  divider:{borderTop:'1px solid var(--border)',margin:'16px 0'},
  tag:{display:'inline-flex',alignItems:'center',gap:4,fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,padding:'4px 10px',borderRadius:100},
}

export default function AnmeldungPage() {
  const [kongress,setKongress] = useState<Kongress|null>(null)
  const [kurse,setKurse] = useState<Kurs[]>([])
  const [selected,setSelected] = useState<Set<number>>(new Set())
  const [form,setForm] = useState<FormData>(EMPTY)
  const [step,setStep] = useState<Step>('form')
  const [errors,setErrors] = useState<Errors>({})
  const [konflikt,setKonflikt] = useState('')
  const [duplikat,setDuplikat] = useState(false)
  const [pageLoading,setPageLoading] = useState(true)
  const [checkLoading,setCheckLoading] = useState(false)
  const [submitLoading,setSubmitLoading] = useState(false)
  const [submitError,setSubmitError] = useState('')
  const [scrolled,setScrolled] = useState(false)

  useEffect(()=>{
    getAktuellerKongress().then(k=>{
      if(k){setKongress(k);getKurse(k.id).then(setKurse)}
      setPageLoading(false)
    })
    const onScroll = ()=>setScrolled(window.scrollY>80)
    window.addEventListener('scroll',onScroll)
    return ()=>window.removeEventListener('scroll',onScroll)
  },[])

  const frueh = kongress ? isFruehbucher(kongress) : false
  const gesamtbetrag = Array.from(selected).reduce((s,id)=>{
    const k = kurse.find(k=>k.id===id)
    return k ? s+getPreis(k,form.ist_oegsmp_mitglied,frueh) : s
  },0)
  const blockKurse = kurse.filter(k=>k.kurs_gruppe==='block')
  const psKurse = kurse.filter(k=>k.kurs_gruppe==='ps')
  const tsKurse = kurse.filter(k=>k.kurs_gruppe==='ts')

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
    if(errors.kurse)setErrors(prev=>({...prev,kurse:''}))
  }

  function setF<K extends keyof FormData>(key:K,value:FormData[K]){
    setForm(prev=>({...prev,[key]:value}))
    if(errors[key])setErrors(prev=>({...prev,[key]:''}))
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
    setErrors(errs)
    return Object.keys(errs).length===0
  }

  async function goConfirm(){
    if(!validate()||!kongress)return
    setCheckLoading(true)
    const exists=await emailExists(form.email.trim(),kongress.id)
    setCheckLoading(false)
    if(exists){setDuplikat(true);setErrors(prev=>({...prev,email:'Diese E-Mail ist bereits registriert'}));document.getElementById('f-email')?.scrollIntoView({behavior:'smooth',block:'center'});return}
    setDuplikat(false);setStep('confirm');window.scrollTo({top:0,behavior:'smooth'})
  }

  async function submit(){
    if(!kongress)return
    setSubmitLoading(true);setSubmitError('')
    try{
      const{data:tn,error:e1}=await supabase.from('teilnehmer').insert({
        vorname:form.vorname.trim(),nachname:form.nachname.trim(),
        strasse:form.strasse.trim(),hausnummer:form.hausnummer.trim(),
        stadt:form.stadt.trim(),postleitzahl:form.postleitzahl.trim(),
        land:form.land.trim(),oeak_nr:form.oeak_nr.trim(),
        email:form.email.trim().toLowerCase(),
        ist_oegsmp_mitglied:form.ist_oegsmp_mitglied,
        kongress_id:kongress.id,registriert_am:new Date().toISOString(),
      }).select('id').single()
      if(e1)throw new Error(e1.message)
      const buchungen=Array.from(selected).map(kurs_id=>{
        const k=kurse.find(k=>k.id===kurs_id)!
        return{teilnehmer_id:tn.id,kurs_id,gebuchter_preis:getPreis(k,form.ist_oegsmp_mitglied,frueh),zahlungsstatus:'ausstehend',kongress_id:kongress.id,gebucht_am:new Date().toISOString()}
      })
      const{error:e2}=await supabase.from('buchungen').insert(buchungen)
      if(e2)throw new Error(e2.message)
      const gebuchteKurse=Array.from(selected).map(id=>{
        const k=kurse.find(k=>k.id===id)!
        return{titel:k.titel,uhrzeit:k.uhrzeit??'',preis:getPreis(k,form.ist_oegsmp_mitglied,frueh)}
      })
      await fetch('/api/send-confirmation',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          email:form.email.trim(),vorname:form.vorname,nachname:form.nachname,
          strasse:form.strasse,hausnummer:form.hausnummer,
          postleitzahl:form.postleitzahl,stadt:form.stadt,land:form.land,
          oeak_nr:form.oeak_nr,ist_oegsmp_mitglied:form.ist_oegsmp_mitglied,
          kongress_name:kongress.name,kongress_jahr:kongress.jahr,
          kongress_datum:formatDatum(kongress.datum_von,kongress.datum_bis),
          kongress_start:new Date(kongress.datum_von).toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 15:00 Uhr',
          kongress_ende:new Date(kongress.datum_bis).toLocaleDateString('de-AT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 19:00 Uhr',
          iban:kongress.iban,bic:kongress.bic,kontoinhaber:kongress.kontoinhaber,
          kontakt_email:kongress.kontakt_email,
          fruehbucher_bis:formatDE(kongress.fruehbucher_bis),
          storno_kostenlos_bis:formatDE(kongress.storno_kostenlos_bis),
          storno_50_bis:formatDE(kongress.storno_50_bis),
          sekretariat_zeiten:(kongress as any).sekretariat_zeiten??'',
          gebuchte_kurse:gebuchteKurse,gesamtbetrag,
        }),
      })
      setStep('done');window.scrollTo({top:0,behavior:'smooth'})
    }catch(e){
      setSubmitError(e instanceof Error?e.message:'Fehler. Bitte versuchen Sie es erneut.')
    }finally{setSubmitLoading(false)}
  }

  if(pageLoading)return(
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:'center'}}>
        <div style={{width:36,height:36,border:'3px solid rgba(255,200,3,0.15)',borderTop:'3px solid var(--gold)',borderRadius:'50%',animation:'spin 0.9s linear infinite',margin:'0 auto 16px'}}/>
        <p style={{color:'rgba(255,255,255,0.3)',fontSize:12,letterSpacing:'0.2em'}}>LADEN</p>
      </div>
    </div>
  )

  if(!kongress)return(
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:'rgba(255,255,255,0.3)'}}>Kein aktiver Kongress gefunden.</p>
    </div>
  )

  const fruehText=formatDE(kongress.fruehbucher_bis)
  const stornoFreeText=formatDE(kongress.storno_kostenlos_bis)
  const storno50Text=formatDE(kongress.storno_50_bis)
  const fullName=`${form.vorname} ${form.nachname}`.trim()

  return(
    <main style={{minHeight:'100vh',background:'var(--off-white)'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .hero-btn:hover{opacity:0.85!important}
        .fi-input:focus{border-color:var(--gold)!important;background:var(--white)!important;box-shadow:0 0 0 3px rgba(255,200,3,0.12)!important}
        .kurs-row:hover{border-color:rgba(255,200,3,0.3)!important;background:rgba(255,200,3,0.02)!important}
        .kurs-row.selected{border-color:rgba(255,200,3,0.5)!important;background:rgba(255,200,3,0.04)!important}
        @media(max-width:640px){
          .hero-title{font-size:1.6rem!important}
          .hero-content{padding:100px 20px 48px!important}
          .step-label{display:none!important}
          .grid-2{grid-template-columns:1fr!important}
          .grid-3{grid-template-columns:1fr!important}
          .ps-grid{grid-template-columns:1fr!important}
          .form-row{flex-direction:column!important}
          .confirm-btns{flex-direction:column!important}
        }
      `}</style>

      {/* HERO */}
      <div style={{position:'relative',height:'100vh',minHeight:560,maxHeight:800,overflow:'hidden'}}>
        <img src="/hero.jpg" alt="St. Christoph am Arlberg" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center'}}/>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(10,22,40,0.3) 0%,rgba(10,22,40,0.5) 60%,rgba(10,22,40,0.85) 100%)'}}/>

        {/* NAV */}
        <div style={{
          position:'fixed',top:0,left:0,right:0,zIndex:100,
          padding:'16px 32px',display:'flex',alignItems:'center',justifyContent:'space-between',
          background: scrolled ? 'rgba(10,22,40,0.92)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(255,200,3,0.1)' : 'none',
          transition:'all 0.3s ease',
        }}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <img src="/logo.svg" alt="Logo" style={{height:40,width:40,objectFit:'contain'}} onError={e=>{(e.target as HTMLImageElement).style.display='none'}}/>
            <div>
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.25em',textTransform:'uppercase',color:'rgba(255,255,255,0.5)',lineHeight:1}}>Anmeldung</p>
              <p style={{fontSize:13,fontWeight:700,color:'var(--white)',lineHeight:1.3,marginTop:3}}>{kongress.name}</p>
            </div>
          </div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',letterSpacing:'0.1em'}}>
            {new Date(kongress.datum_von).toLocaleDateString('de-AT')} – {new Date(kongress.datum_bis).toLocaleDateString('de-AT')}
          </div>
        </div>

        {/* HERO CONTENT */}
        <div className="hero-content" style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 32px 56px',animation:'fadeUp 0.8s ease forwards'}}>
          <div style={{maxWidth:720,margin:'0 auto'}}>
            <div style={{...S.tag,background:'rgba(255,200,3,0.15)',border:'1px solid rgba(255,200,3,0.3)',color:'var(--gold)',marginBottom:20}}>
              Anmeldung zum {kongress.jahr}
            </div>
            <h1 className="hero-title" style={{fontSize:'clamp(1.8rem,4vw,3rem)',fontWeight:800,color:'var(--white)',lineHeight:1.15,marginBottom:16,letterSpacing:'-0.02em'}}>
              {kongress.name}
            </h1>
            <p style={{fontSize:16,color:'rgba(255,255,255,0.65)',marginBottom:6,fontWeight:500}}>
              {kongress.ort}
            </p>
            <p style={{fontSize:14,color:'var(--gold)',fontWeight:600,letterSpacing:'0.1em'}}>
              {new Date(kongress.datum_von).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})} – {new Date(kongress.datum_bis).toLocaleDateString('de-AT',{day:'numeric',month:'long',year:'numeric'})}
            </p>
          </div>
        </div>
      </div>

      {/* STEP INDICATOR */}
      <div style={{background:'var(--navy)',borderBottom:'1px solid rgba(255,200,3,0.1)',position:'sticky',top:0,zIndex:50}}>
        <div style={{maxWidth:720,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center'}}>
          {(['form','confirm','done'] as Step[]).map((s,i)=>{
            const labels=['Daten & Kurse','Überprüfen','Bestätigung']
            const idx=['form','confirm','done'].indexOf(step)
            const active=i===idx, done=i<idx
            return(
              <div key={s} style={{display:'flex',alignItems:'center',flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 0'}}>
                  <div style={{
                    width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:10,fontWeight:800,flexShrink:0,
                    background:done||active?'var(--gold)':'rgba(255,255,255,0.08)',
                    color:done||active?'var(--navy)':'rgba(255,255,255,0.25)',
                    boxShadow:active?'var(--shadow-gold)':'none',
                    transition:'var(--transition)',
                  }}>{done?'✓':i+1}</div>
                  <span className="step-label" style={{fontSize:11,fontWeight:active?600:400,color:active?'var(--white)':'rgba(255,255,255,0.3)',letterSpacing:'0.04em',whiteSpace:'nowrap'}}>{labels[i]}</span>
                </div>
                {i<2&&<div style={{flex:1,height:1,background:done?'rgba(255,200,3,0.3)':'rgba(255,255,255,0.06)',margin:'0 10px',transition:'var(--transition)'}}/>}
              </div>
            )
          })}
        </div>
      </div>

      {/* CONTENT */}
      <div style={{maxWidth:720,margin:'0 auto',padding:'32px 24px 48px',display:'flex',flexDirection:'column',gap:16}}>

        {/* ── STEP 1 ── */}
        {step==='form'&&<>
          {/* INFO */}
          <div className="grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={{...S.card,padding:18,background:'rgba(255,200,3,0.04)',border:'1px solid rgba(255,200,3,0.18)'}}>
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--gold-dark)',marginBottom:8}}>⭐ Frühbucherbonus</p>
              <p style={{fontSize:12,color:'var(--text-2)',lineHeight:1.6}}>Zahlungseingang bis {fruehText}. Ab dem Folgetag gilt der Normaltarif.</p>
            </div>
            <div style={{...S.card,padding:18}}>
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:8}}>ℹ Stornogebühren</p>
              <p style={{fontSize:12,color:'var(--text-2)',lineHeight:1.6}}>Bis {stornoFreeText}: kostenlos · Bis {storno50Text}: 50% · Danach: keine Erstattung</p>
            </div>
          </div>

          {/* PREISTABELLE */}
          <div style={S.card}>
            <div style={{...S.cardHeader}}>
              <div style={S.accentBar}/>
              <span style={S.cardHeaderText}>Preisübersicht</span>
            </div>
            <div style={{padding:'4px 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr>
                    {['Kurs','Datum & Uhrzeit','Frühbucher','Normal'].map((h,i)=>(
                      <th key={h} style={{padding:'14px 0 10px',textAlign:i>1?'right':'left',fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--text-3)',borderBottom:'1px solid var(--border)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={4} style={{padding:'14px 0 6px',fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--gold-dark)'}}>Blockkurse</td></tr>
                  {blockKurse.map(k=>(
                    <tr key={k.id} style={{borderBottom:'1px solid rgba(10,22,40,0.04)'}}>
                      <td style={{padding:'10px 0',fontWeight:600,color:'var(--text)'}}>
                        {k.titel}
                        {k.mitglied_fruehbucher_preis&&k.titel.toLowerCase().includes('suckert')&&
                          <span style={{marginLeft:8,fontSize:9,color:'#2563eb',fontWeight:700,background:'rgba(37,99,235,0.08)',padding:'2px 6px',borderRadius:4}}>ÖGSMP −€20</span>}
                      </td>
                      <td style={{padding:'10px 0',color:'var(--text-3)',fontSize:11}}>{k.uhrzeit??k.wochentag_datum}</td>
                      <td style={{padding:'10px 0',textAlign:'right',fontWeight:700,color:'var(--text)'}}>€ {k.fruehbucher_preis}</td>
                      <td style={{padding:'10px 0',textAlign:'right',fontWeight:700,color:'var(--gold-dark)'}}>€ {k.spaetbucher_preis}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} style={{padding:'14px 0 6px',fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--gold-dark)'}}>Praxis- & Theorieseminare</td></tr>
                  {psKurse.map((k,i)=>{
                    const ts=tsKurse[i]
                    return(
                      <tr key={k.id} style={{borderBottom:'1px solid rgba(10,22,40,0.04)'}}>
                        <td style={{padding:'10px 0',color:'var(--text)'}}>{k.titel} / {ts?.titel}</td>
                        <td style={{padding:'10px 0',color:'var(--text-3)',fontSize:11}}>{k.uhrzeit??k.wochentag_datum}</td>
                        <td style={{padding:'10px 0',textAlign:'right',fontWeight:700,color:'var(--text)'}}>€ {k.fruehbucher_preis}</td>
                        <td style={{padding:'10px 0',textAlign:'right',fontWeight:700,color:'var(--gold-dark)'}}>€ {k.spaetbucher_preis}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* HINWEISE */}
          <div style={{background:'rgba(10,22,40,0.03)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'16px 20px'}}>
            <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:10}}>Wichtige Hinweise</p>
            {['GK LIP und Work-Shop finden gleichzeitig statt — nur eines buchbar','PS und TS laufen parallel — tageweiser Wechsel möglich (PS1=PS2 usw.)','Ski Alpin & Ärztesport über Ski Austria Akademie — im Zimmerpreis inkl.','Steuerliche Absetzbarkeit bei mind. 8 Std. Nachweis'].map((h,i)=>(
              <p key={i} style={{fontSize:12,color:'var(--text-2)',padding:'4px 0 4px 14px',position:'relative',lineHeight:1.5}}>
                <span style={{position:'absolute',left:0,color:'var(--gold)',fontWeight:700}}>→</span>{h}
              </p>
            ))}
          </div>

          {/* PERSÖNLICHE DATEN */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={S.accentBar}/>
              <span style={S.cardHeaderText}>Persönliche Daten</span>
            </div>
            <div style={S.cardBody}>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <div className="grid-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <FI label="Vorname *" id="f-vn" value={form.vorname} onChange={v=>setF('vorname',v)} error={errors.vorname}/>
                  <FI label="Nachname *" id="f-nn" value={form.nachname} onChange={v=>setF('nachname',v)} error={errors.nachname}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 100px',gap:12}}>
                  <FI label="Straße *" id="f-st" value={form.strasse} onChange={v=>setF('strasse',v)} error={errors.strasse}/>
                  <FI label="Nr. *" id="f-hn" value={form.hausnummer} onChange={v=>setF('hausnummer',v)} error={errors.hausnummer}/>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:12}}>
                  <FI label="PLZ *" id="f-plz" value={form.postleitzahl} onChange={v=>setF('postleitzahl',v)} error={errors.postleitzahl}/>
                  <FI label="Stadt *" id="f-ct" value={form.stadt} onChange={v=>setF('stadt',v)} error={errors.stadt}/>
                </div>
                <FI label="Land *" id="f-ld" value={form.land} onChange={v=>setF('land',v)} error={errors.land}/>
                <FI label="ÖÄK-Nr. * (internationale Gäste: 0)" id="f-ok" value={form.oeak_nr} onChange={v=>setF('oeak_nr',v)} error={errors.oeak_nr}/>
                <div id="f-email">
                  <FI label="E-Mail *" id="f-em" type="email" value={form.email} onChange={v=>{setF('email',v);setDuplikat(false)}} error={errors.email}/>
                </div>
                {duplikat&&(
                  <div style={{background:'rgba(37,99,235,0.05)',border:'1px solid rgba(37,99,235,0.15)',borderRadius:'var(--radius-sm)',padding:'12px 14px',fontSize:13,color:'#1d4ed8',lineHeight:1.6}}>
                    Diese E-Mail ist bereits für den Kongress {kongress.jahr} registriert. Bei Änderungswünschen: <a href={`mailto:${kongress.kontakt_email}`} style={{fontWeight:700,textDecoration:'underline'}}>{kongress.kontakt_email}</a>
                  </div>
                )}
                <label style={{
                  display:'flex',alignItems:'center',gap:12,padding:'13px 15px',
                  borderRadius:'var(--radius-sm)',border:`1.5px solid ${form.ist_oegsmp_mitglied?'rgba(255,200,3,0.4)':'var(--border)'}`,
                  background:form.ist_oegsmp_mitglied?'rgba(255,200,3,0.04)':'var(--off-white)',
                  cursor:'pointer',transition:'var(--transition)',
                }}>
                  <input type="checkbox" checked={form.ist_oegsmp_mitglied} onChange={e=>setF('ist_oegsmp_mitglied',e.target.checked)} style={{width:16,height:16,accentColor:'var(--gold)',flexShrink:0}}/>
                  <div>
                    <p style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Aktives ÖGSMP-Mitglied</p>
                    <p style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>Rabatt beim Reinhard Suckert Symposium (−€ 20)</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* KURSAUSWAHL */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <div style={S.accentBar}/>
              <span style={S.cardHeaderText}>Kursauswahl</span>
            </div>
            <div style={S.cardBody}>
              {konflikt&&<Alert type="error" msg={`⚠ ${konflikt}`}/>}
              {errors.kurse&&<Alert type="error" msg={`⚠ ${errors.kurse}`}/>}

              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:12}}>Blockkurse</p>
              {blockKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)}/>)}

              <div style={S.divider}/>

              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase',color:'var(--text-3)',marginBottom:4}}>Praxis- & Theorieseminare</p>
              <p style={{fontSize:12,color:'var(--text-3)',marginBottom:14}}>PS und TS laufen parallel — tageweiser Wechsel möglich</p>
              <div className="ps-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>Praxisseminare</p>
                  {psKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:10}}>Theorieseminare</p>
                  {tsKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
              </div>
            </div>
          </div>

          {/* SUMME */}
          {selected.size>0&&(
            <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.2)',borderRadius:'var(--radius-lg)',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'var(--shadow-gold)'}}>
              <div>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.35)',marginBottom:4}}>{selected.size} Kurs{selected.size!==1?'e':''} ausgewählt</p>
                <p style={{fontSize:26,fontWeight:800,color:'var(--white)',letterSpacing:'-0.02em'}}>€ {gesamtbetrag.toFixed(2)}</p>
              </div>
              {frueh
                ?<div style={{textAlign:'right'}}>
                  <div style={{...S.tag,background:'rgba(255,200,3,0.15)',border:'1px solid rgba(255,200,3,0.3)',color:'var(--gold)'}}>Frühbucherpreis</div>
                  <p style={{fontSize:11,color:'rgba(255,255,255,0.3)',marginTop:6}}>bis {fruehText}</p>
                </div>
                :<div style={{...S.tag,background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.3)'}}>Normaltarif</div>
              }
            </div>
          )}

          <Btn onClick={goConfirm} disabled={checkLoading} primary>
            {checkLoading?'Wird geprüft…':'Weiter zur Überprüfung →'}
          </Btn>
        </>}

        {/* ── STEP 2 ── */}
        {step==='confirm'&&<>
          <div style={S.card}>
            <div style={S.cardHeader}><div style={S.accentBar}/><span style={S.cardHeaderText}>Persönliche Daten</span></div>
            <div style={S.cardBody}>
              {[['Vorname',form.vorname],['Nachname',form.nachname],['Straße',`${form.strasse} ${form.hausnummer}`],['PLZ / Stadt',`${form.postleitzahl} ${form.stadt}`],['Land',form.land],['ÖÄK-Nr.',form.oeak_nr],['E-Mail',form.email],...(form.ist_oegsmp_mitglied?[['ÖGSMP-Mitglied','Ja']]:[])].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:16}}>
                  <span style={{fontSize:13,color:'var(--text-3)',flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'var(--text)',textAlign:'right'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={S.card}>
            <div style={S.cardHeader}><div style={S.accentBar}/><span style={S.cardHeaderText}>Gebuchte Kurse</span></div>
            <div style={S.cardBody}>
              {Array.from(selected).map(id=>{
                const k=kurse.find(k=>k.id===id)!
                const p=getPreis(k,form.ist_oegsmp_mitglied,frueh)
                return(
                  <div key={id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{k.titel}</span>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--text)',flexShrink:0,marginLeft:16}}>€ {p.toFixed(2)}</span>
                    </div>
                    {k.uhrzeit&&<p style={{fontSize:11,color:'var(--text-3)',marginTop:3}}>{k.uhrzeit}</p>}
                  </div>
                )
              })}
              <div style={{display:'flex',justifyContent:'space-between',padding:'14px 0 0',fontWeight:800,fontSize:15}}>
                <span>Gesamtbetrag</span>
                <span style={{color:'var(--gold-dark)'}}>€ {gesamtbetrag.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.15)',borderRadius:'var(--radius-lg)',padding:'24px',boxShadow:'var(--shadow-gold)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
              <div style={S.accentBar}/>
              <span style={{...S.cardHeaderText,color:'rgba(255,200,3,0.6)'}}>Zahlung</span>
            </div>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginBottom:18,lineHeight:1.6}}>Bitte überweisen Sie nach der Anmeldung. Nach Zahlungseingang erhalten Sie eine Rechnung per E-Mail.</p>
            <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,200,3,0.1)',borderRadius:'var(--radius-sm)',padding:'16px'}}>
              {[['IBAN',kongress.iban,true],['BIC',kongress.bic,false],['Kontoinhaber',kongress.kontoinhaber,false],['Verwendungszweck',fullName,true],['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0',alignItems:'baseline'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',width:130,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color:hi?'var(--gold)':'rgba(255,255,255,0.65)'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {submitError&&<Alert type="error" msg={submitError}/>}

          <div className="confirm-btns" style={{display:'flex',gap:12}}>
            <button onClick={()=>{setStep('form');window.scrollTo({top:0,behavior:'smooth'})}} style={{flex:1,background:'var(--white)',border:'1.5px solid var(--border)',color:'var(--text)',fontFamily:'var(--font)',fontWeight:600,fontSize:14,padding:'14px',borderRadius:'var(--radius)',cursor:'pointer'}}>
              ← Zurück
            </button>
            <Btn onClick={submit} disabled={submitLoading} primary style={{flex:2}}>
              {submitLoading?'Wird gespeichert…':'Jetzt verbindlich anmelden'}
            </Btn>
          </div>
        </>}

        {/* ── STEP 3 ── */}
        {step==='done'&&(
          <div style={{...S.card,padding:'48px 32px',textAlign:'center'}}>
            <div style={{width:64,height:64,background:'rgba(34,197,94,0.08)',border:'2px solid rgba(34,197,94,0.2)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px',fontSize:26,color:'#16a34a'}}>✓</div>
            <h2 style={{fontSize:22,fontWeight:800,color:'var(--text)',marginBottom:10,letterSpacing:'-0.01em'}}>Anmeldung eingegangen!</h2>
            <p style={{fontSize:14,color:'var(--text-2)',marginBottom:28,lineHeight:1.7}}>Danke, {form.vorname}! Eine Bestätigungs-E-Mail wurde an <strong style={{color:'var(--text)'}}>{form.email}</strong> gesendet.</p>
            <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.15)',borderRadius:'var(--radius)',padding:'20px 24px',textAlign:'left',marginBottom:20}}>
              {[['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true],['IBAN',kongress.iban,false],['BIC',kongress.bic,false],['Verwendungszweck',fullName,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',width:120,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color:hi?'var(--gold)':'rgba(255,255,255,0.65)'}}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:'var(--text-3)'}}>Fragen? <a href={`mailto:${kongress.kontakt_email}`} style={{color:'var(--gold-dark)',fontWeight:600}}>{kongress.kontakt_email}</a></p>
          </div>
        )}

        <p style={{textAlign:'center',fontSize:11,color:'var(--text-3)',paddingBottom:8}}>
          Prof. h.c. Univ.-Doz. Dr. Günther Neumayr · <a href={`mailto:${kongress.kontakt_email}`} style={{color:'var(--gold-dark)'}}>{kongress.kontakt_email}</a>
        </p>
      </div>
    </main>
  )
}

function FI({label,id,value,onChange,type='text',error}:{label:string;id:string;value:string;onChange:(v:string)=>void;type?:string;error?:string}){
  return(
    <div>
      <label htmlFor={id} style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-2)',marginBottom:6,letterSpacing:'0.04em'}}>{label}</label>
      <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} autoComplete="off"
        className="fi-input"
        style={{width:'100%',background:'var(--off-white)',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 13px',fontSize:14,color:'var(--text)',outline:'none',fontFamily:'var(--font)',transition:'var(--transition)'}}
      />
      {error&&<p style={{fontSize:11,color:'#dc2626',marginTop:4,fontWeight:500}}>{error}</p>}
    </div>
  )
}

function KursRow({kurs,selected,preis,onToggle,compact}:{kurs:Kurs;selected:boolean;preis:number;onToggle:()=>void;compact?:boolean}){
  return(
    <label className={`kurs-row${selected?' selected':''}`} style={{
      display:'flex',alignItems:'center',gap:12,cursor:'pointer',
      borderRadius:'var(--radius-sm)',border:`1.5px solid ${selected?'rgba(255,200,3,0.45)':'var(--border)'}`,
      padding:compact?'9px 11px':'12px 14px',marginBottom:7,
      background:selected?'rgba(255,200,3,0.03)':'var(--off-white)',
      transition:'var(--transition)',
    }}>
      <input type="checkbox" checked={selected} onChange={onToggle} style={{width:15,height:15,accentColor:'var(--gold)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize:compact?12:13,fontWeight:600,color:'var(--text)'}}>{kurs.titel}</p>
        <p style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{kurs.uhrzeit??kurs.wochentag_datum}</p>
      </div>
      <span style={{fontSize:compact?12:13,fontWeight:700,color:'var(--text)',flexShrink:0}}>€ {preis}</span>
    </label>
  )
}

function Btn({onClick,children,disabled,primary,style}:{onClick?:()=>void;children:React.ReactNode;disabled?:boolean;primary?:boolean;style?:React.CSSProperties}){
  return(
    <button onClick={onClick} disabled={disabled} style={{
      display:'flex',alignItems:'center',justifyContent:'center',gap:8,
      background:primary?'var(--gold)':'var(--white)',
      border:primary?'none':'1.5px solid var(--border)',
      color:primary?'var(--navy)':'var(--text)',
      fontFamily:'var(--font)',fontWeight:700,fontSize:14,letterSpacing:'0.03em',
      padding:'15px 24px',borderRadius:'var(--radius)',cursor:disabled?'not-allowed':'pointer',
      transition:'var(--transition)',boxShadow:primary?'var(--shadow-gold)':'none',
      opacity:disabled?0.6:1,width:'100%',...style,
    }}>
      {children}
    </button>
  )
}

function Alert({type,msg}:{type:'error'|'info';msg:string}){
  const isError=type==='error'
  return(
    <div style={{background:isError?'rgba(239,68,68,0.05)':'rgba(37,99,235,0.05)',border:`1px solid ${isError?'rgba(239,68,68,0.2)':'rgba(37,99,235,0.2)'}`,borderRadius:'var(--radius-sm)',padding:'12px 14px',fontSize:13,color:isError?'#dc2626':'#1d4ed8',lineHeight:1.6,marginBottom:12}}>
      {msg}
    </div>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase, getAktuellerKongress, getKurse, emailExists, getPreis, isFruehbucher, formatDE, formatDatum, type Kongress, type Kurs } from '@/lib/db'

type FormData = {
  vorname: string; nachname: string; strasse: string; hausnummer: string
  stadt: string; postleitzahl: string; land: string; oeak_nr: string
  email: string; ist_oegsmp_mitglied: boolean
}
type Step = 'form' | 'confirm' | 'done'
type Errors = Partial<Record<keyof FormData | 'kurse', string>>
const EMPTY: FormData = { vorname:'', nachname:'', strasse:'', hausnummer:'', stadt:'', postleitzahl:'', land:'Österreich', oeak_nr:'', email:'', ist_oegsmp_mitglied:false }

export default function AnmeldungPage() {
  const [kongress, setKongress] = useState<Kongress|null>(null)
  const [kurse, setKurse] = useState<Kurs[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [form, setForm] = useState<FormData>(EMPTY)
  const [step, setStep] = useState<Step>('form')
  const [errors, setErrors] = useState<Errors>({})
  const [konflikt, setKonflikt] = useState('')
  const [duplikat, setDuplikat] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [checkLoading, setCheckLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    getAktuellerKongress().then(k => {
      if (k) { setKongress(k); getKurse(k.id).then(setKurse) }
      setPageLoading(false)
    })
  }, [])

  const frueh = kongress ? isFruehbucher(kongress) : false
  const gesamtbetrag = Array.from(selected).reduce((s, id) => {
    const k = kurse.find(k => k.id === id)
    return k ? s + getPreis(k, form.ist_oegsmp_mitglied, frueh) : s
  }, 0)

  const blockKurse = kurse.filter(k => k.kurs_gruppe === 'block')
  const psKurse = kurse.filter(k => k.kurs_gruppe === 'ps')
  const tsKurse = kurse.filter(k => k.kurs_gruppe === 'ts')

  function getKonfliktIds(kurs: Kurs): number[] {
    const result: number[] = []
    const num = parseInt(kurs.titel.replace(/\D/g, ''))
    if (isNaN(num)) return result
    const pendant = kurse.find(k => k.id !== kurs.id && ['ps','ts'].includes(k.kurs_gruppe) && k.kurs_gruppe !== kurs.kurs_gruppe && parseInt(k.titel.replace(/\D/g,'')) === num)
    if (pendant) result.push(pendant.id)
    const pairNum = num % 2 === 1 ? num + 1 : num - 1
    const pair = kurse.find(k => k.id !== kurs.id && k.kurs_gruppe === kurs.kurs_gruppe && parseInt(k.titel.replace(/\D/g,'')) === pairNum)
    if (pair) result.push(pair.id)
    return result
  }

  function toggleKurs(kurs: Kurs) {
    const next = new Set(selected)
    if (next.has(kurs.id)) { next.delete(kurs.id); setKonflikt(''); setSelected(next); return }
    if (kurs.exklusiv_gruppe) {
      const clash = kurse.find(k => k.exklusiv_gruppe === kurs.exklusiv_gruppe && next.has(k.id))
      if (clash) { setKonflikt(`"${kurs.titel}" und "${clash.titel}" können nicht gleichzeitig gebucht werden.`); return }
    }
    getKonfliktIds(kurs).forEach(id => next.delete(id))
    setKonflikt(''); next.add(kurs.id); setSelected(next)
    if (errors.kurse) setErrors(prev => ({ ...prev, kurse: '' }))
  }

  function setF<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }))
  }

  function validate(): boolean {
    const errs: Errors = {}
    const req: [keyof FormData, string][] = [
      ['vorname','Vorname fehlt'],['nachname','Nachname fehlt'],['strasse','Straße fehlt'],
      ['hausnummer','Hausnummer fehlt'],['postleitzahl','PLZ fehlt'],['stadt','Stadt fehlt'],
      ['land','Land fehlt'],['oeak_nr','ÖÄK-Nr. fehlt'],['email','E-Mail fehlt'],
    ]
    req.forEach(([f, msg]) => { if (!(form[f] as string).trim()) errs[f] = msg })
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Ungültige E-Mail-Adresse'
    if (selected.size === 0) errs.kurse = 'Bitte mindestens einen Kurs auswählen'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function goConfirm() {
    if (!validate() || !kongress) return
    setCheckLoading(true)
    const exists = await emailExists(form.email.trim(), kongress.id)
    setCheckLoading(false)
    if (exists) { setDuplikat(true); setErrors(prev => ({...prev, email: 'Diese E-Mail ist bereits registriert'})); document.getElementById('f-email')?.scrollIntoView({behavior:'smooth',block:'center'}); return }
    setDuplikat(false); setStep('confirm'); window.scrollTo({top:0,behavior:'smooth'})
  }

  async function submit() {
    if (!kongress) return
    setSubmitLoading(true); setSubmitError('')
    try {
      const { data: tn, error: e1 } = await supabase.from('teilnehmer').insert({
        vorname: form.vorname.trim(), nachname: form.nachname.trim(),
        strasse: form.strasse.trim(), hausnummer: form.hausnummer.trim(),
        stadt: form.stadt.trim(), postleitzahl: form.postleitzahl.trim(),
        land: form.land.trim(), oeak_nr: form.oeak_nr.trim(),
        email: form.email.trim().toLowerCase(),
        ist_oegsmp_mitglied: form.ist_oegsmp_mitglied,
        kongress_id: kongress.id, registriert_am: new Date().toISOString(),
      }).select('id').single()
      if (e1) throw new Error(e1.message)
      const buchungen = Array.from(selected).map(kurs_id => {
        const k = kurse.find(k => k.id === kurs_id)!
        return { teilnehmer_id: tn.id, kurs_id, gebuchter_preis: getPreis(k, form.ist_oegsmp_mitglied, frueh), zahlungsstatus: 'ausstehend', kongress_id: kongress.id, gebucht_am: new Date().toISOString() }
      })
      const { error: e2 } = await supabase.from('buchungen').insert(buchungen)
      if (e2) throw new Error(e2.message)
      const gebuchteKurse = Array.from(selected).map(id => {
        const k = kurse.find(k => k.id === id)!
        return { titel: k.titel, uhrzeit: k.uhrzeit ?? '', preis: getPreis(k, form.ist_oegsmp_mitglied, frueh) }
      })
      await fetch('/api/send-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(), vorname: form.vorname, nachname: form.nachname,
          strasse: form.strasse, hausnummer: form.hausnummer,
          postleitzahl: form.postleitzahl, stadt: form.stadt, land: form.land,
          oeak_nr: form.oeak_nr, ist_oegsmp_mitglied: form.ist_oegsmp_mitglied,
          kongress_name: kongress.name, kongress_jahr: kongress.jahr,
          kongress_datum: formatDatum(kongress.datum_von, kongress.datum_bis),
          kongress_start: new Date(kongress.datum_von).toLocaleDateString('de-AT', {weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 15:00 Uhr',
          kongress_ende: new Date(kongress.datum_bis).toLocaleDateString('de-AT', {weekday:'long',day:'numeric',month:'long',year:'numeric'})+', 19:00 Uhr',
          iban: kongress.iban, bic: kongress.bic, kontoinhaber: kongress.kontoinhaber,
          kontakt_email: kongress.kontakt_email,
          fruehbucher_bis: formatDE(kongress.fruehbucher_bis),
          storno_kostenlos_bis: formatDE(kongress.storno_kostenlos_bis),
          storno_50_bis: formatDE(kongress.storno_50_bis),
          sekretariat_zeiten: (kongress as any).sekretariat_zeiten ?? '',
          gebuchte_kurse: gebuchteKurse, gesamtbetrag,
        }),
      })
      setStep('done'); window.scrollTo({top:0,behavior:'smooth'})
    } catch(e) {
      setSubmitError(e instanceof Error ? e.message : 'Fehler. Bitte versuchen Sie es erneut.')
    } finally { setSubmitLoading(false) }
  }

  if (pageLoading) return (
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center'}}>
        <div style={{width:40,height:40,border:'3px solid rgba(255,200,3,0.2)',borderTop:'3px solid var(--primary)',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
        <p style={{color:'rgba(255,255,255,0.4)',fontSize:13,letterSpacing:'0.15em'}}>Wird geladen…</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!kongress) return (
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <p style={{color:'rgba(255,255,255,0.4)'}}>Kein aktiver Kongress gefunden.</p>
    </div>
  )

  const fruehText = formatDE(kongress.fruehbucher_bis)
  const stornoFreeText = formatDE(kongress.storno_kostenlos_bis)
  const storno50Text = formatDE(kongress.storno_50_bis)
  const fullName = `${form.vorname} ${form.nachname}`.trim()

  return (
    <main style={{minHeight:'100vh',background:'var(--snow)'}}>
      {/* HERO */}
      <div style={{background:'var(--navy)',padding:'64px 24px 56px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 0%, rgba(255,200,3,0.08) 0%, transparent 70%)'}}/>
        <div style={{maxWidth:720,margin:'0 auto',position:'relative',textAlign:'center'}}>
          <div style={{display:'inline-block',background:'rgba(255,200,3,0.12)',border:'1px solid rgba(255,200,3,0.25)',borderRadius:100,padding:'6px 18px',marginBottom:24}}>
            <span style={{fontSize:11,fontWeight:600,letterSpacing:'0.2em',textTransform:'uppercase' as const,color:'var(--primary)'}}>Anmeldung zum</span>
          </div>
          <h1 style={{fontFamily:'var(--font)',fontSize:'clamp(1.5rem,3.5vw,2.5rem)',fontWeight:700,color:'var(--white)',lineHeight:1.2,marginBottom:16,letterSpacing:'-0.01em'}}>
            {kongress.name} {kongress.jahr}
          </h1>
          <p style={{fontSize:15,color:'rgba(255,255,255,0.6)',letterSpacing:'0.08em',marginBottom:8}}>{kongress.ort}</p>
          <p style={{fontSize:14,color:'var(--primary)',fontWeight:600,letterSpacing:'0.15em'}}>
            {new Date(kongress.datum_von).toLocaleDateString('de-AT')} – {new Date(kongress.datum_bis).toLocaleDateString('de-AT')}
          </p>
        </div>
      </div>

      {/* STEPS */}
      <div style={{background:'var(--navy-light)',borderBottom:'1px solid rgba(255,200,3,0.1)'}}>
        <div style={{maxWidth:720,margin:'0 auto',padding:'0 24px',display:'flex',alignItems:'center'}}>
          {(['form','confirm','done'] as Step[]).map((s, i) => {
            const labels = ['Daten & Kurse','Überprüfen','Bestätigung']
            const idx = ['form','confirm','done'].indexOf(step)
            const active = i === idx
            const done = i < idx
            return (
              <div key={s} style={{display:'flex',alignItems:'center',flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:10,padding:'16px 0'}}>
                  <div style={{
                    width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:11,fontWeight:700,flexShrink:0,
                    background: done ? 'var(--primary)' : active ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: done ? 'var(--navy)' : active ? 'var(--navy)' : 'rgba(255,255,255,0.3)',
                  }}>{done ? '✓' : i+1}</div>
                  <span style={{fontSize:12,fontWeight:500,color: active ? 'var(--white)' : 'rgba(255,255,255,0.35)',letterSpacing:'0.05em',whiteSpace:'nowrap' as const}}>{labels[i]}</span>
                </div>
                {i < 2 && <div style={{flex:1,height:1,background:'rgba(255,255,255,0.08)',margin:'0 12px'}}/>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{maxWidth:720,margin:'0 auto',padding:'32px 24px',display:'flex',flexDirection:'column' as const,gap:20}}>

        {/* STEP 1 */}
        {step === 'form' && <>
          {/* INFO CARDS */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[
              {label:'Frühbucherbonus',icon:'⭐',text:`Zahlungseingang bis ${fruehText}. Ab dem Folgetag gilt der Normaltarif.`,color:'rgba(255,200,3,0.08)',border:'rgba(255,200,3,0.2)',accent:'var(--primary-dark)'},
              {label:'Stornogebühren',icon:'ℹ️',text:`Bis ${stornoFreeText}: kostenlos · Bis ${storno50Text}: 50% · Danach: keine Rückerstattung`,color:'rgba(10,22,40,0.03)',border:'var(--border-light)',accent:'var(--text-muted)'},
            ].map(c=>(
              <div key={c.label} style={{background:c.color,border:`1px solid ${c.border}`,borderRadius:'var(--radius-lg)',padding:'16px 18px'}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:c.accent,marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
                  <span>{c.icon}</span>{c.label}
                </div>
                <p style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>{c.text}</p>
              </div>
            ))}
          </div>

          {/* PREISTABELLE */}
          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
            <div style={{padding:'20px 24px 0',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border-light)',paddingBottom:16}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'var(--text-muted)'}}>Preisübersicht</h2>
            </div>
            <div style={{padding:'0 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse' as const,fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border-light)'}}>
                    {['Kurs','Datum & Uhrzeit','Frühbucher','Normaltarif'].map((h,i)=>(
                      <th key={h} style={{padding:'12px 0 10px',textAlign: i>1 ? 'right' as const : 'left' as const,fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase' as const,color:'var(--ice)'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={4} style={{padding:'14px 0 6px',fontSize:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'var(--primary-dark)'}}>Blockkurse</td></tr>
                  {blockKurse.map(k=>(
                    <tr key={k.id} style={{borderBottom:'1px solid rgba(10,22,40,0.04)'}}>
                      <td style={{padding:'10px 0',fontWeight:600,color:'var(--navy)'}}>
                        {k.titel}
                        {k.mitglied_fruehbucher_preis&&k.titel.toLowerCase().includes('suckert')&&
                          <span style={{marginLeft:8,fontSize:10,color:'#3b82f6',fontWeight:700,background:'rgba(59,130,246,0.08)',padding:'2px 7px',borderRadius:6}}>ÖGSMP −€20</span>}
                      </td>
                      <td style={{padding:'10px 0',color:'var(--text-muted)',fontSize:11}}>{k.uhrzeit ?? k.wochentag_datum}</td>
                      <td style={{padding:'10px 0',textAlign:'right' as const,fontWeight:700,color:'var(--navy)'}}>€ {k.fruehbucher_preis}</td>
                      <td style={{padding:'10px 0',textAlign:'right' as const,fontWeight:700,color:'var(--primary-dark)'}}>€ {k.spaetbucher_preis}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} style={{padding:'14px 0 6px',fontSize:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'var(--primary-dark)'}}>Praxis- & Theorieseminare</td></tr>
                  {psKurse.map((k,i)=>{
                    const ts=tsKurse[i]
                    return(
                      <tr key={k.id} style={{borderBottom:'1px solid rgba(10,22,40,0.04)'}}>
                        <td style={{padding:'10px 0',color:'var(--text)'}}>{k.titel} / {ts?.titel}</td>
                        <td style={{padding:'10px 0',color:'var(--text-muted)',fontSize:11}}>{k.uhrzeit ?? k.wochentag_datum}</td>
                        <td style={{padding:'10px 0',textAlign:'right' as const,fontWeight:700,color:'var(--navy)'}}>€ {k.fruehbucher_preis}</td>
                        <td style={{padding:'10px 0',textAlign:'right' as const,fontWeight:700,color:'var(--primary-dark)'}}>€ {k.spaetbucher_preis}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* HINWEISE */}
          <div style={{background:'rgba(10,22,40,0.03)',border:'1px solid rgba(10,22,40,0.06)',borderRadius:'var(--radius-lg)',padding:'18px 20px'}}>
            <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'var(--text-muted)',marginBottom:12}}>Wichtige Hinweise</p>
            {['GK LIP und Work-Shop finden gleichzeitig statt — nur eines buchbar','PS und TS laufen parallel — tageweiser Wechsel möglich (PS1=PS2, TS1=TS2 usw.)','Ski Alpin & Ärztesport über Ski Austria Akademie — im Zimmerpreis inkl.','Steuerliche Absetzbarkeit bei mind. 8 Std. Nachweis (Grundkurs, Theorie, Praxis)'].map((h,i)=>(
              <p key={i} style={{fontSize:12,color:'var(--text-muted)',padding:'5px 0 5px 16px',position:'relative' as const}}>
                <span style={{position:'absolute' as const,left:0,color:'var(--primary)',fontWeight:700}}>→</span>
                {h}
              </p>
            ))}
          </div>

          {/* PERSÖNLICHE DATEN */}
          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
            <div style={{background:'var(--navy)',padding:'20px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.6)'}}>Persönliche Daten</h2>
            </div>
            <div style={{padding:'24px',display:'flex',flexDirection:'column' as const,gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <FI label="Vorname *" id="f-vorname" value={form.vorname} onChange={v=>setF('vorname',v)} error={errors.vorname}/>
                <FI label="Nachname *" id="f-nachname" value={form.nachname} onChange={v=>setF('nachname',v)} error={errors.nachname}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12}}>
                <FI label="Straße *" id="f-strasse" value={form.strasse} onChange={v=>setF('strasse',v)} error={errors.strasse}/>
                <div style={{width:100}}><FI label="Nr. *" id="f-hausnummer" value={form.hausnummer} onChange={v=>setF('hausnummer',v)} error={errors.hausnummer}/></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:12}}>
                <div style={{width:110}}><FI label="PLZ *" id="f-plz" value={form.postleitzahl} onChange={v=>setF('postleitzahl',v)} error={errors.postleitzahl}/></div>
                <FI label="Stadt *" id="f-stadt" value={form.stadt} onChange={v=>setF('stadt',v)} error={errors.stadt}/>
              </div>
              <FI label="Land *" id="f-land" value={form.land} onChange={v=>setF('land',v)} error={errors.land}/>
              <FI label="ÖÄK-Nr. * (internationale Gäste: 0)" id="f-oeak" value={form.oeak_nr} onChange={v=>setF('oeak_nr',v)} error={errors.oeak_nr}/>
              <div id="f-email">
                <FI label="E-Mail *" id="f-email-inp" type="email" value={form.email} onChange={v=>{setF('email',v);setDuplikat(false)}} error={errors.email}/>
              </div>
              {duplikat && (
                <div style={{background:'rgba(59,130,246,0.06)',border:'1px solid rgba(59,130,246,0.2)',borderRadius:'var(--radius)',padding:'14px 16px',fontSize:13,color:'#1e40af',lineHeight:1.6}}>
                  Diese E-Mail ist bereits für den Kongress {kongress.jahr} registriert. Bei Änderungswünschen: <a href={`mailto:${kongress.kontakt_email}`} style={{fontWeight:700,textDecoration:'underline'}}>{kongress.kontakt_email}</a>
                </div>
              )}
              <label style={{
                display:'flex',alignItems:'center',gap:12,padding:'14px 16px',
                borderRadius:'var(--radius)',border:`1px solid ${form.ist_oegsmp_mitglied ? 'rgba(255,200,3,0.4)' : 'rgba(10,22,40,0.08)'}`,
                background: form.ist_oegsmp_mitglied ? 'rgba(255,200,3,0.05)' : 'rgba(10,22,40,0.02)',
                cursor:'pointer',transition:'var(--transition)'
              }}>
                <input type="checkbox" checked={form.ist_oegsmp_mitglied} onChange={e=>setF('ist_oegsmp_mitglied',e.target.checked)} style={{width:16,height:16,accentColor:'var(--primary)'}}/>
                <div>
                  <p style={{fontSize:13,fontWeight:600,color:'var(--navy)'}}>Aktives ÖGSMP-Mitglied</p>
                  <p style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Rabatt beim Reinhard Suckert Symposium (−€ 20)</p>
                </div>
              </label>
            </div>
          </div>

          {/* KURSAUSWAHL */}
          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
            <div style={{background:'var(--navy)',padding:'20px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.6)'}}>Kursauswahl</h2>
            </div>
            <div style={{padding:'24px'}}>
              {konflikt && <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--radius)',padding:'12px 14px',fontSize:13,color:'#dc2626',marginBottom:16}}>⚠ {konflikt}</div>}
              {errors.kurse && <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--radius)',padding:'12px 14px',fontSize:13,color:'#dc2626',marginBottom:16}}>⚠ {errors.kurse}</div>}
              
              <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'var(--text-muted)',marginBottom:12}}>Blockkurse</p>
              {blockKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)}/>)}
              
              <div style={{borderTop:'1px solid var(--border-light)',margin:'20px 0'}}/>
              <p style={{fontSize:10,fontWeight:700,letterSpacing:'0.15em',textTransform:'uppercase' as const,color:'var(--text-muted)',marginBottom:4}}>Praxis- & Theorieseminare</p>
              <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:16}}>PS und TS laufen parallel — tageweiser Wechsel möglich</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'var(--text)',marginBottom:10}}>Praxisseminare</p>
                  {psKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
                <div>
                  <p style={{fontSize:11,fontWeight:600,color:'var(--text)',marginBottom:10}}>Theorieseminare</p>
                  {tsKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}
                </div>
              </div>
            </div>
          </div>

          {/* SUMME */}
          {selected.size > 0 && (
            <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.2)',borderRadius:'var(--radius-xl)',padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',boxShadow:'var(--shadow-gold)'}}>
              <div>
                <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginBottom:4}}>{selected.size} Kurs{selected.size!==1?'e':''} ausgewählt</p>
                <p style={{fontSize:28,fontWeight:800,color:'var(--white)'}}>€ {gesamtbetrag.toFixed(2)}</p>
              </div>
              {frueh
                ? <div style={{textAlign:'right' as const}}>
                    <span style={{background:'rgba(255,200,3,0.15)',border:'1px solid rgba(255,200,3,0.3)',color:'var(--primary)',fontSize:11,fontWeight:700,padding:'6px 14px',borderRadius:100,letterSpacing:'0.1em'}}>Frühbucherpreis</span>
                    <p style={{fontSize:11,color:'rgba(255,255,255,0.4)',marginTop:6}}>bis {fruehText}</p>
                  </div>
                : <span style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.4)',fontSize:11,fontWeight:600,padding:'6px 14px',borderRadius:100}}>Normaltarif</span>
              }
            </div>
          )}

          <button onClick={goConfirm} disabled={checkLoading} style={{
            width:'100%',background:'var(--primary)',border:'none',color:'var(--navy)',
            fontFamily:'var(--font)',fontWeight:700,fontSize:14,letterSpacing:'0.08em',
            padding:'17px',borderRadius:'var(--radius-lg)',cursor:'pointer',
            transition:'var(--transition)',boxShadow:'var(--shadow-gold)',
            opacity: checkLoading ? 0.7 : 1,
          }}>
            {checkLoading ? 'Wird geprüft…' : 'Weiter zur Überprüfung →'}
          </button>
        </>}

        {/* STEP 2 */}
        {step === 'confirm' && <>
          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
            <div style={{background:'var(--navy)',padding:'20px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.6)'}}>Persönliche Daten</h2>
            </div>
            <div style={{padding:'20px 24px'}}>
              {[['Vorname',form.vorname],['Nachname',form.nachname],['Straße',`${form.strasse} ${form.hausnummer}`],['PLZ / Stadt',`${form.postleitzahl} ${form.stadt}`],['Land',form.land],['ÖÄK-Nr.',form.oeak_nr],['E-Mail',form.email],...(form.ist_oegsmp_mitglied?[['ÖGSMP-Mitglied','Ja']]:[])].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border-light)',gap:16}}>
                  <span style={{fontSize:13,color:'var(--text-muted)',flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,color:'var(--navy)',textAlign:'right' as const}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',overflow:'hidden',boxShadow:'var(--shadow-sm)'}}>
            <div style={{background:'var(--navy)',padding:'20px 24px',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,255,255,0.6)'}}>Gebuchte Kurse</h2>
            </div>
            <div style={{padding:'20px 24px'}}>
              {Array.from(selected).map(id => {
                const k=kurse.find(k=>k.id===id)!
                const p=getPreis(k,form.ist_oegsmp_mitglied,frueh)
                return (
                  <div key={id} style={{padding:'12px 0',borderBottom:'1px solid var(--border-light)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--navy)'}}>{k.titel}</span>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--navy)',flexShrink:0,marginLeft:16}}>€ {p.toFixed(2)}</span>
                    </div>
                    {k.uhrzeit&&<p style={{fontSize:11,color:'var(--text-muted)',marginTop:3}}>{k.uhrzeit}</p>}
                  </div>
                )
              })}
              <div style={{display:'flex',justifyContent:'space-between',padding:'14px 0 0',fontWeight:800,fontSize:15}}>
                <span style={{color:'var(--navy)'}}>Gesamtbetrag</span>
                <span style={{color:'var(--primary-dark)'}}>€ {gesamtbetrag.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.2)',borderRadius:'var(--radius-xl)',padding:'24px',boxShadow:'var(--shadow-gold)'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div style={{width:3,height:16,background:'var(--primary)',borderRadius:2}}/>
              <h2 style={{fontSize:11,fontWeight:700,letterSpacing:'0.18em',textTransform:'uppercase' as const,color:'rgba(255,200,3,0.7)'}}>Zahlung</h2>
            </div>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.5)',marginBottom:18,lineHeight:1.6}}>Bitte überweisen Sie nach der Anmeldung. Nach Zahlungseingang erhalten Sie eine Rechnung per E-Mail.</p>
            <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,200,3,0.15)',borderRadius:'var(--radius)',padding:'16px 18px'}}>
              {[['IBAN',kongress.iban,true],['BIC',kongress.bic,false],['Kontoinhaber',kongress.kontoinhaber,false],['Verwendungszweck',fullName,true],['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0',alignItems:'baseline'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.35)',width:130,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color: hi ? 'var(--primary)' : 'rgba(255,255,255,0.7)'}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {submitError && <div style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--radius)',padding:'14px 16px',fontSize:13,color:'#dc2626'}}>{submitError}</div>}

          <div style={{display:'flex',gap:12}}>
            <button onClick={()=>{setStep('form');window.scrollTo({top:0,behavior:'smooth'})}} style={{
              flex:1,background:'transparent',border:'1px solid rgba(10,22,40,0.12)',color:'var(--text)',
              fontFamily:'var(--font)',fontWeight:600,fontSize:14,padding:'16px',
              borderRadius:'var(--radius-lg)',cursor:'pointer',transition:'var(--transition)',
            }}>← Zurück</button>
            <button onClick={submit} disabled={submitLoading} style={{
              flex:2,background:'var(--primary)',border:'none',color:'var(--navy)',
              fontFamily:'var(--font)',fontWeight:700,fontSize:14,letterSpacing:'0.05em',
              padding:'16px',borderRadius:'var(--radius-lg)',cursor:'pointer',
              transition:'var(--transition)',boxShadow:'var(--shadow-gold)',
              opacity: submitLoading ? 0.7 : 1,
            }}>
              {submitLoading ? 'Wird gespeichert…' : 'Jetzt verbindlich anmelden'}
            </button>
          </div>
        </>}

        {/* STEP 3 */}
        {step === 'done' && (
          <div style={{background:'var(--white)',border:'1px solid var(--border-light)',borderRadius:'var(--radius-xl)',padding:'48px 32px',textAlign:'center' as const,boxShadow:'var(--shadow-md)'}}>
            <div style={{width:64,height:64,background:'rgba(34,197,94,0.1)',border:'2px solid rgba(34,197,94,0.2)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 24px',fontSize:24,color:'#16a34a'}}>✓</div>
            <h2 style={{fontSize:22,fontWeight:800,color:'var(--navy)',marginBottom:10}}>Anmeldung eingegangen!</h2>
            <p style={{fontSize:14,color:'var(--text-muted)',marginBottom:28,lineHeight:1.6}}>Danke, {form.vorname}! Eine Bestätigungs-E-Mail wurde an <strong style={{color:'var(--navy)'}}>{form.email}</strong> gesendet.</p>
            <div style={{background:'var(--navy)',border:'1px solid rgba(255,200,3,0.2)',borderRadius:'var(--radius-lg)',padding:'20px 24px',textAlign:'left' as const,marginBottom:20}}>
              {[['Betrag',`€ ${gesamtbetrag.toFixed(2)}`,true],['IBAN',kongress.iban,false],['BIC',kongress.bic,false],['Verwendungszweck',fullName,true]].map(([l,v,hi])=>(
                <div key={l as string} style={{display:'flex',gap:16,padding:'5px 0'}}>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.35)',width:120,flexShrink:0}}>{l}</span>
                  <span style={{fontSize:13,fontWeight:600,fontFamily:'monospace',color: hi ? 'var(--primary)' : 'rgba(255,255,255,0.7)'}}>{v}</span>
                </div>
              ))}
            </div>
            <p style={{fontSize:12,color:'var(--text-muted)'}}>Fragen? <a href={`mailto:${kongress.kontakt_email}`} style={{color:'var(--primary-dark)',fontWeight:600}}>{kongress.kontakt_email}</a></p>
          </div>
        )}

        <p style={{textAlign:'center' as const,fontSize:11,color:'var(--text-muted)',paddingBottom:8}}>
          Prof. h.c. Univ.-Doz. Dr. Günther Neumayr · <a href={`mailto:${kongress.kontakt_email}`} style={{color:'var(--primary-dark)'}}>{kongress.kontakt_email}</a>
        </p>
      </div>
    </main>
  )
}

function FI({label,id,value,onChange,type='text',error}:{label:string;id:string;value:string;onChange:(v:string)=>void;type?:string;error?:string}) {
  return (
    <div>
      <label htmlFor={id} style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6,letterSpacing:'0.05em'}}>{label}</label>
      <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} autoComplete="off" style={{
        width:'100%',background: error ? 'rgba(239,68,68,0.03)' : 'rgba(10,22,40,0.02)',
        border: `1.5px solid ${error ? 'rgba(239,68,68,0.4)' : 'rgba(10,22,40,0.1)'}`,
        borderRadius:'var(--radius)',padding:'10px 13px',fontSize:14,color:'var(--navy)',
        outline:'none',transition:'var(--transition)',fontFamily:'var(--font)',
      }}
      onFocus={e=>{e.target.style.borderColor='var(--primary)';e.target.style.background='var(--white)'}}
      onBlur={e=>{e.target.style.borderColor=error?'rgba(239,68,68,0.4)':'rgba(10,22,40,0.1)';e.target.style.background='rgba(10,22,40,0.02)'}}
      />
      {error && <p style={{fontSize:11,color:'#dc2626',marginTop:4,fontWeight:500}}>{error}</p>}
    </div>
  )
}

function KursRow({kurs,selected,preis,onToggle,compact}:{kurs:Kurs;selected:boolean;preis:number;onToggle:()=>void;compact?:boolean}) {
  return (
    <label style={{
      display:'flex',alignItems:'center',gap:12,cursor:'pointer',
      borderRadius:'var(--radius)',border:`1.5px solid ${selected ? 'rgba(255,200,3,0.4)' : 'rgba(10,22,40,0.07)'}`,
      padding:compact ? '10px 12px' : '13px 14px',
      marginBottom:8,
      background: selected ? 'rgba(255,200,3,0.04)' : 'rgba(10,22,40,0.01)',
      transition:'var(--transition)',
    }}>
      <input type="checkbox" checked={selected} onChange={onToggle} style={{width:16,height:16,accentColor:'var(--primary)',flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontSize: compact?12:13,fontWeight:600,color:'var(--navy)'}}>{kurs.titel}</p>
        <p style={{fontSize:10,color:'var(--text-muted)',marginTop:2}}>{kurs.uhrzeit ?? kurs.wochentag_datum}</p>
      </div>
      <span style={{fontSize: compact?12:13,fontWeight:700,color:'var(--navy)',flexShrink:0}}>€ {preis}</span>
    </label>
  )
}

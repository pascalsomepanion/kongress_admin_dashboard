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
      if (clash) { setKonflikt(`"${kurs.titel}" und "${clash.titel}" koennen nicht gleichzeitig gebucht werden.`); return }
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
      ['vorname','Vorname fehlt'],['nachname','Nachname fehlt'],['strasse','Strasse fehlt'],
      ['hausnummer','Hausnummer fehlt'],['postleitzahl','PLZ fehlt'],['stadt','Stadt fehlt'],
      ['land','Land fehlt'],['oeak_nr','ÖÄK-Nr. fehlt'],['email','E-Mail fehlt'],
    ]
    req.forEach(([f, msg]) => { if (!(form[f] as string).trim()) errs[f] = msg })
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Ungueltige E-Mail-Adresse'
    if (selected.size === 0) errs.kurse = 'Bitte mindestens einen Kurs auswaehlen'
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

      await fetch('/api/send-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(), vorname: form.vorname, nachname: form.nachname,
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
          kurs_titel: Array.from(selected).map(id => kurse.find(k=>k.id===id)!.titel),
          gesamtbetrag,
        }),
      })
      setStep('done'); window.scrollTo({top:0,behavior:'smooth'})
    } catch(e) {
      setSubmitError(e instanceof Error ? e.message : 'Fehler. Bitte versuchen Sie es erneut.')
    } finally { setSubmitLoading(false) }
  }

  if (pageLoading) return <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center"><p className="text-gray-400 text-sm">Wird geladen...</p></div>
  if (!kongress) return <div className="min-h-screen bg-[#F7F6F3] flex items-center justify-center"><p className="text-gray-400 text-sm">Kein aktiver Kongress gefunden.</p></div>

  const fruehText = formatDE(kongress.fruehbucher_bis)
  const stornoFreeText = formatDE(kongress.storno_kostenlos_bis)
  const storno50Text = formatDE(kongress.storno_50_bis)
  const fullName = `${form.vorname} ${form.nachname}`.trim()

  return (
    <main className="min-h-screen bg-[#F7F6F3]">
      {/* HERO */}
      <div className="bg-[#FFBF00] px-6 py-12">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-black/60 mb-1">Anmeldung zum</p>
          <h1 className="text-3xl font-extrabold text-black mb-2">{kongress.name} {kongress.jahr}</h1>
          <p className="text-black/70 text-base font-medium mb-1">{kongress.ort}</p>
          <p className="text-black/55 text-sm">{new Date(kongress.datum_von).toLocaleDateString('de-AT')} - {new Date(kongress.datum_bis).toLocaleDateString('de-AT')}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {/* STEPS */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3.5 flex items-center">
          {(['form','confirm','done'] as Step[]).map((s, i) => {
            const labels = ['Daten & Kurse','Überprüfen','Bestätigung']
            const idx = ['form','confirm','done'].indexOf(step)
            return (
              <div key={s} className="flex items-center flex-1 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < idx ? 'bg-black text-white' : i===idx ? 'bg-[#FFBF00] text-black' : 'bg-gray-100 text-gray-400'}`}>{i < idx ? '✓' : i+1}</div>
                <span className={`text-xs font-medium ml-2 truncate ${i===idx?'text-gray-900 font-semibold':'text-gray-400'}`}>{labels[i]}</span>
                {i < 2 && <div className="flex-1 h-px bg-gray-200 mx-3 min-w-[12px]"/>}
              </div>
            )
          })}
        </div>

        {/* STEP 1 */}
        {step === 'form' && <>
          {/* INFO */}
          <div className="grid grid-cols-2 gap-3">
            {[['Frühbucherbonus',`Zahlungseingang bis ${fruehText}. Ab dem Folgetag gilt der Normaltarif.`],['Stornogebühren',`Bis ${stornoFreeText}: kostenlos · Bis ${storno50Text}: 50 % · Danach: keine Rückerstattung`]].map(([l,v])=>(
              <div key={l} className="bg-white border border-gray-200 rounded-2xl p-4">
                <p className="text-[10px] font-bold tracking-widest uppercase text-amber-600 mb-2">{l}</p>
                <p className="text-xs text-gray-500 leading-relaxed">{v}</p>
              </div>
            ))}
          </div>

          {/* PREISTABELLE */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Preisübersicht</h2></div>
            <table className="w-full text-xs border-collapse">
              <thead><tr className="border-b-2 border-gray-100">{['Kurs','Datum','Frühbucher','Normaltarif'].map(h=><th key={h} className={`pb-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 ${h!=='Kurs'?'text-right':''}`}>{h}</th>)}</tr></thead>
              <tbody>
                <tr><td colSpan={4} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Blockkurse</td></tr>
                {blockKurse.map(k=>(
                  <tr key={k.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700 font-medium">{k.titel}{k.mitglied_fruehbucher_preis&&k.titel.toLowerCase().includes('suckert')&&<span className="ml-1.5 text-[10px] text-blue-600 font-semibold bg-blue-50 px-1.5 py-0.5 rounded">ÖGSMP −€20</span>}</td>
                    <td className="py-2 text-right text-gray-400">{k.wochentag_datum}</td>
                    <td className="py-2 text-right font-semibold text-gray-800">€ {k.fruehbucher_preis}</td>
                    <td className="py-2 text-right font-semibold text-amber-700">€ {k.spaetbucher_preis}</td>
                  </tr>
                ))}
                <tr><td colSpan={4} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Praxis- & Theorieseminare pro Tag</td></tr>
                {psKurse.map(k=>(
                  <tr key={k.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{k.wochentag_datum}</td>
                    <td className="py-2 text-right text-gray-400 text-[10px]">PS + TS</td>
                    <td className="py-2 text-right font-semibold text-gray-800">€ {k.fruehbucher_preis}</td>
                    <td className="py-2 text-right font-semibold text-amber-700">€ {k.spaetbucher_preis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* HINWEISE */}
          <div className="bg-[#FFF9E6] border border-[#FFE082] rounded-2xl p-5 space-y-1.5">
            <p className="text-[10px] font-bold tracking-widest uppercase text-amber-700 mb-3">Wichtige Hinweise</p>
            {['GK LIP und Work-Shop finden gleichzeitig statt — nur eines buchbar','PS und TS laufen parallel — tageweiser Wechsel möglich (PS1=PS2, TS1=TS2 usw.)','Ski Alpin & Ärztesport über Ski Austria Akademie (skiakademie.at) — im Zimmerpreis inkl.','Steuerliche Absetzbarkeit bei mind. 8 Std. Nachweis (Grundkurs, Theorie, Praxis)'].map((h,i)=>(
              <p key={i} className="text-xs text-amber-900 pl-4 relative before:content-['→'] before:absolute before:left-0 before:text-amber-600 before:font-bold">{h}</p>
            ))}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-5"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Persönliche Daten</h2></div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <FI label="Vorname *" id="f-vorname" value={form.vorname} onChange={v=>setF('vorname',v)} error={errors.vorname}/>
                <FI label="Nachname *" id="f-nachname" value={form.nachname} onChange={v=>setF('nachname',v)} error={errors.nachname}/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><FI label="Strasse *" id="f-strasse" value={form.strasse} onChange={v=>setF('strasse',v)} error={errors.strasse}/></div>
                <FI label="Nr. *" id="f-hausnummer" value={form.hausnummer} onChange={v=>setF('hausnummer',v)} error={errors.hausnummer}/>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FI label="PLZ *" id="f-plz" value={form.postleitzahl} onChange={v=>setF('postleitzahl',v)} error={errors.postleitzahl}/>
                <div className="col-span-2"><FI label="Stadt *" id="f-stadt" value={form.stadt} onChange={v=>setF('stadt',v)} error={errors.stadt}/></div>
              </div>
              <FI label="Land *" id="f-land" value={form.land} onChange={v=>setF('land',v)} error={errors.land}/>
              <FI label="ÖÄK-Nr. * (internationale Gaeste: 0)" id="f-oeak" value={form.oeak_nr} onChange={v=>setF('oeak_nr',v)} error={errors.oeak_nr}/>
              <div id="f-email">
                <FI label="E-Mail *" id="f-email-inp" type="email" value={form.email} onChange={v=>{setF('email',v);setDuplikat(false)}} error={errors.email}/>
              </div>
              {duplikat && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm p-4 rounded-xl leading-relaxed">
                  Diese E-Mail ist bereits fuer den Kongress {kongress.jahr} registriert.
                  Bei Aenderungswuenschen bitte melden bei: <a href={`mailto:${kongress.kontakt_email}`} className="font-bold underline">{kongress.kontakt_email}</a>
                </div>
              )}
              <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.ist_oegsmp_mitglied?'border-[#FFBF00] bg-[#FFF9E6]':'border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300'}`}>
                <input type="checkbox" checked={form.ist_oegsmp_mitglied} onChange={e=>setF('ist_oegsmp_mitglied',e.target.checked)} className="w-4 h-4 accent-amber-500"/>
                <div><p className="text-sm font-semibold text-gray-900">Aktives ÖGSMP-Mitglied</p><p className="text-xs text-gray-400 mt-0.5">Rabatt beim Reinhard Suckert Symposium (−€ 20)</p></div>
              </label>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Kursauswahl</h2></div>
            {konflikt && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-3">{konflikt}</div>}
            {errors.kurse && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl mb-3">{errors.kurse}</div>}
            <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-3">Blockkurse</p>
            {blockKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)}/>)}
            <hr className="border-gray-100 my-4"/>
            <p className="text-[10px] font-bold tracking-widest uppercase text-gray-400 mb-1">Praxis- und Theorieseminare</p>
            <p className="text-xs text-gray-400 mb-3">PS und TS laufen parallel - tageweiser Wechsel moeglich</p>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs font-semibold text-gray-500 mb-2">Praxisseminare</p>{psKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}</div>
              <div><p className="text-xs font-semibold text-gray-500 mb-2">Theorieseminare</p>{tsKurse.map(k=><KursRow key={k.id} kurs={k} selected={selected.has(k.id)} preis={getPreis(k,form.ist_oegsmp_mitglied,frueh)} onToggle={()=>toggleKurs(k)} compact/>)}</div>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="bg-white border-2 border-[#FFBF00] rounded-2xl px-6 py-4 flex items-center justify-between">
              <div><p className="text-xs text-gray-400">{selected.size} Kurs{selected.size!==1?'e':''} ausgewaehlt</p><p className="text-2xl font-extrabold">EUR {gesamtbetrag.toFixed(2)}</p></div>
              {frueh ? <div className="text-right"><span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Frühbucherpreis</span><p className="text-xs text-gray-400 mt-1">bis {fruehText}</p></div> : <span className="bg-gray-100 text-gray-500 text-xs font-bold px-3 py-1 rounded-full">Normaltarif</span>}
            </div>
          )}
          <button onClick={goConfirm} disabled={checkLoading} className="w-full bg-[#FFBF00] hover:bg-[#FFD54F] disabled:bg-gray-200 disabled:text-gray-400 text-black font-bold py-4 rounded-2xl transition-all text-sm">
            {checkLoading ? 'Wird geprüft…' : 'Weiter zur Überprüfung'}
          </button>
        </>}

        {/* STEP 2 */}
        {step === 'confirm' && <>
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Daten überprüfen</h2></div>
            {[['Name',fullName],['Adresse',`${form.strasse} ${form.hausnummer}, ${form.postleitzahl} ${form.stadt}, ${form.land}`],['ÖÄK-Nr.',form.oeak_nr],['E-Mail',form.email],...(form.ist_oegsmp_mitglied?[['ÖGSMP-Mitglied','Ja']]:[])] .map(([l,v])=>(
              <div key={l} className="flex justify-between py-2 border-b border-gray-100 last:border-0 text-sm gap-4"><span className="text-gray-400 flex-shrink-0">{l}</span><span className="font-semibold text-right">{v}</span></div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Gebuchte Kurse</h2></div>
            {Array.from(selected).map(id => { const k=kurse.find(k=>k.id===id)!; const p=getPreis(k,form.ist_oegsmp_mitglied,frueh); return (
              <div key={id} className="flex justify-between py-2 border-b border-gray-100 last:border-0 text-sm"><span className="text-gray-600">{k.titel}</span><span className="font-semibold">EUR {p.toFixed(2)}</span></div>
            )})}
            <div className="flex justify-between pt-3 mt-1 border-t-2 border-gray-100 font-bold"><span>Gesamtbetrag</span><span className="text-amber-700">EUR {gesamtbetrag.toFixed(2)}</span></div>
          </div>

          <div className="bg-[#FFF9E6] border border-[#FFE082] rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-4"><div className="w-1 h-4 bg-[#FFBF00] rounded-full"/><h2 className="text-[10px] font-bold tracking-widest uppercase text-amber-700">Zahlung</h2></div>
            <p className="text-sm text-amber-800 mb-4 leading-relaxed">Bitte ueberweisen Sie nach der Anmeldung. Nach Zahlungseingang erhalten Sie eine Rechnung per E-Mail.</p>
            <div className="bg-white rounded-xl border border-amber-200 p-4 space-y-2">
              {[['IBAN',kongress.iban,true],['BIC',kongress.bic,false],['Kontoinhaber',kongress.kontoinhaber,false],['Verwendungszweck',fullName,true],['Betrag',`EUR ${gesamtbetrag.toFixed(2)}`,true]].map(([l,v,hi])=>(
                <div key={l as string} className="flex gap-3 items-baseline"><span className="text-gray-400 text-xs w-32 flex-shrink-0">{l}</span><span className={`text-sm font-semibold font-mono ${hi?'text-amber-700':'text-gray-700'}`}>{v}</span></div>
              ))}
            </div>
          </div>

          {submitError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-4 rounded-xl">{submitError}</div>}
          <div className="flex gap-3">
            <button onClick={()=>{setStep('form');window.scrollTo({top:0,behavior:'smooth'})}} className="flex-1 border-2 border-gray-200 text-gray-700 font-semibold py-4 rounded-2xl hover:bg-gray-50 transition-all text-sm">Zurück</button>
            <button onClick={submit} disabled={submitLoading} className="flex-[2] bg-[#FFBF00] hover:bg-[#FFD54F] disabled:bg-gray-200 disabled:text-gray-400 text-black font-bold py-4 rounded-2xl transition-all text-sm">
              {submitLoading ? 'Wird gespeichert…' : 'Jetzt verbindlich anmelden'}
            </button>
          </div>
        </>}

        {/* STEP 3 */}
        {step === 'done' && (
          <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
            <div className="w-16 h-16 bg-green-100 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-bold text-green-600">✓</div>
            <h2 className="text-2xl font-extrabold mb-2">Anmeldung eingegangen!</h2>
            <p className="text-gray-500 text-sm mb-6 leading-relaxed">Danke, {form.vorname}! Eine Bestätigungs-E-Mail wurde an <strong>{form.email}</strong> gesendet.</p>
            <div className="bg-[#FFF9E6] border border-[#FFE082] rounded-xl p-5 text-left space-y-2 mb-5">
              {[['Betrag',`EUR ${gesamtbetrag.toFixed(2)}`,true],['IBAN',kongress.iban,false],['BIC',kongress.bic,false],['Verwendungszweck',fullName,true]].map(([l,v,hi])=>(
                <div key={l as string} className="flex gap-3"><span className="text-gray-400 text-xs w-32 flex-shrink-0">{l}</span><span className={`text-sm font-semibold font-mono ${hi?'text-amber-700':'text-gray-700'}`}>{v}</span></div>
              ))}
            </div>
            <p className="text-xs text-gray-400">Fragen? <a href={`mailto:${kongress.kontakt_email}`} className="text-amber-700 font-semibold hover:underline">{kongress.kontakt_email}</a></p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-4">Prof. h.c. Univ.-Doz. Dr. Günther Neumayr · <a href={`mailto:${kongress.kontakt_email}`} className="hover:underline">{kongress.kontakt_email}</a></p>
      </div>
    </main>
  )
}

function FI({label,id,value,onChange,type='text',error,placeholder}:{label:string;id:string;value:string;onChange:(v:string)=>void;type?:string;error?:string;placeholder?:string}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
        className={`w-full bg-gray-50 border-2 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:bg-white focus:border-[#FFBF00] focus:ring-2 focus:ring-[#FFBF00]/20 transition-all ${error?'border-red-400 bg-red-50':'border-gray-200'}`}/>
      {error && <p className="text-xs text-red-600 font-medium mt-1">{error}</p>}
    </div>
  )
}

function KursRow({kurs,selected,preis,onToggle,compact}:{kurs:Kurs;selected:boolean;preis:number;onToggle:()=>void;compact?:boolean}) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer rounded-xl border-2 px-3 py-2.5 transition-all mb-1.5 ${selected?'border-[#FFBF00] bg-[#FFF9E6]':'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="w-4 h-4 accent-amber-500 flex-shrink-0"/>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-gray-900 ${compact?'text-xs':'text-sm'}`}>{kurs.titel}</p>
        {!compact && <p className="text-xs text-gray-400 mt-0.5">{kurs.wochentag_datum}</p>}
        {compact && <p className="text-[10px] text-gray-400 mt-0.5">{kurs.wochentag_datum}</p>}
      </div>
      <span className={`font-bold text-gray-800 flex-shrink-0 ${compact?'text-xs':'text-sm'}`}>EUR {preis}</span>
    </label>
  )
}

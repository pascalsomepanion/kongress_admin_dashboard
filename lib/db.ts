import { createClient } from '@supabase/supabase-js'

// ─── Client ──────────────────────────────────────────────────────────────────

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ─── Types (mirror DB exactly) ────────────────────────────────────────────────

export type Kongress = {
  id: number
  name: string
  jahr: number
  status: string
  ort: string
  datum_von: string        // 'YYYY-MM-DD'
  datum_bis: string
  fruehbucher_bis: string
  storno_kostenlos_bis: string
  storno_50_bis: string
  iban: string
  bic: string
  kontoinhaber: string
  kontakt_email: string
  begruessung: string
  sekretariat_zeiten: string
  dfp_id: string | null
}

export type Kurs = {
  id: number
  kongress_id: number
  titel: string
  wochentag_datum: string
  fruehbucher_preis: number
  spaetbucher_preis: number
  mitglied_fruehbucher_preis: number | null
  mitglied_spaetbucher_preis: number | null
  fruehbucher_bis: string
  exklusiv_gruppe: string | null
  nur_als_ganzes: boolean
  kurs_gruppe: 'block' | 'ps' | 'ts'
  sort_order: number
  uhrzeit: string | null
  untertitel: string | null
  dfp_punkte_gesamt: number | null
  einheiten_gesamt: number
  ist_pflichtprogramm: boolean
  oeak_kategorie: string | null
}

export type Teilnehmer = {
  id: number
  kongress_id: number
  vorname: string
  nachname: string
  strasse: string
  hausnummer: string
  stadt: string
  postleitzahl: string
  land: string
  oeak_nr: string
  email: string
  ist_oegsmp_mitglied: boolean
  registriert_am: string
}

export type Buchung = {
  id: number
  teilnehmer_id: number
  kurs_id: number
  kongress_id: number
  gebuchter_preis: number
  zahlungsstatus: 'ausstehend' | 'bezahlt' | 'storniert'
  rechnungsnummer: string | null
  rechnung_versendet_am: string | null
  zahlungs_eingang_am: string | null
  storniert_am: string | null
  gebucht_am: string
}

export type Rechnung = {
  id: number
  kongress_id: number
  teilnehmer_id: number | null
  rechnungsnummer: string
  typ: 'teilnehmer' | 'sponsor'
  anrede: string
  gesamtbetrag_brutto: number
  netto: number
  mwst_betrag: number
  mwst_prozent: number
  bezahlt: boolean
  erstellt_am: string
  versendet_am: string | null
}

export type RechnungsPosition = {
  id: number
  rechnung_id: number
  bezeichnung: string
  menge: number
  einzelpreis: number
  gesamtpreis: number
}

export type Sponsor = {
  id: number
  kongress_id: number | null
  firmenname: string
  strasse: string
  hausnummer: string | null
  plz: string
  ort: string
  land: string
  email: string
  uid_nr: string | null
  ansprechperson: string | null
}

export type SponsorRechnung = {
  id: number
  sponsor_id: number
  kongress_id: number | null
  rechnungsnummer: string | null
  betrag_netto: number
  betrag_brutto: number | null
  mwst_typ: 'mit_mwst' | 'reverse_charge' | 'nicht_steuerbar'
  beschreibung: string
  zahlungsstatus: string
  erstellt_am: string
  bezahlt_am: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isFruehbucher(k: Kongress): boolean {
  return new Date() <= new Date(k.fruehbucher_bis + 'T23:59:59')
}

export function getPreis(kurs: Kurs, istMitglied: boolean, frueh: boolean): number {
  if (istMitglied && frueh && kurs.mitglied_fruehbucher_preis !== null)
    return Number(kurs.mitglied_fruehbucher_preis)
  if (istMitglied && !frueh && kurs.mitglied_spaetbucher_preis !== null)
    return Number(kurs.mitglied_spaetbucher_preis)
  return frueh ? Number(kurs.fruehbucher_preis) : Number(kurs.spaetbucher_preis)
}

export function formatDE(d: string): string {
  return new Date(d).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDatum(von: string, bis: string): string {
  const v = new Date(von), b = new Date(bis)
  const s = { day: 'numeric' as const, month: 'long' as const }
  const l = { day: 'numeric' as const, month: 'long' as const, year: 'numeric' as const }
  return `${v.toLocaleDateString('de-AT', s)} – ${b.toLocaleDateString('de-AT', l)}`
}

// Rechnungsnummer generieren: SMK-2027-001 oder SMK-S-2027-001
export function nextRechnungsnr(existing: string[], jahr: number, isSponsoren = false): string {
  const prefix = isSponsoren ? `SMK-S-${jahr}-` : `SMK-${jahr}-`
  const nums = existing
    .filter(n => n?.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, '')) || 0)
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

export function getMwstTyp(land: string): 'mit_mwst' | 'reverse_charge' | 'nicht_steuerbar' {
  const l = land.toLowerCase().trim()
  if (['österreich', 'austria', 'at', 'oesterreich'].includes(l)) return 'mit_mwst'
  const eu = ['deutschland', 'frankreich', 'italien', 'belgien', 'niederlande', 'spanien',
    'portugal', 'griechenland', 'tschechien', 'slowakei', 'ungarn', 'polen', 'kroatien',
    'slowenien', 'rumänien', 'bulgarien', 'estland', 'lettland', 'litauen', 'finnland',
    'schweden', 'dänemark', 'irland', 'luxemburg', 'malta', 'zypern', 'de', 'fr', 'it',
    'nl', 'es', 'pt', 'pl', 'cz', 'sk', 'hu', 'hr', 'si', 'ro', 'bg', 'se', 'dk', 'fi']
  if (eu.some(e => l.includes(e))) return 'reverse_charge'
  return 'nicht_steuerbar'
}

// ─── DB Queries ───────────────────────────────────────────────────────────────

export async function getAktuellerKongress(): Promise<Kongress | null> {
  const { data } = await supabase
    .from('kongresse').select('*')
    .eq('status', 'aktiv')
    .order('jahr', { ascending: false })
    .limit(1).single()
  return data as Kongress | null
}

export async function getKurse(kongressId: number): Promise<Kurs[]> {
  const { data } = await supabase
    .from('kurse').select('*')
    .eq('kongress_id', kongressId)
    .order('sort_order')
  return (data as Kurs[]) ?? []
}

export async function emailExists(email: string, kongressId: number): Promise<boolean> {
  const { data } = await supabase
    .from('teilnehmer').select('id')
    .eq('email', email.toLowerCase().trim())
    .eq('kongress_id', kongressId)
  return (data?.length ?? 0) > 0
}

export async function getAlleRechnungsnummern(kongressId: number): Promise<string[]> {
  const { data } = await supabase
    .from('rechnungen').select('rechnungsnummer')
    .eq('kongress_id', kongressId)
  return (data ?? []).map((r: { rechnungsnummer: string }) => r.rechnungsnummer)
}

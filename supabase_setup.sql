-- ════════════════════════════════════════════════════════════════
-- SPORTMEDIZIN ARLBERG — Komplettes Datenbankschema
-- Einmalig im Supabase SQL Editor ausführen
-- ════════════════════════════════════════════════════════════════

-- 1. KONGRESSE — Haupttabelle pro Kongress-Jahr
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS ort text DEFAULT 'St. Christoph am Arlberg';
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS datum_von date;
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS datum_bis date;
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS fruehbucher_bis date;
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS storno_kostenlos_bis date;
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS storno_50_bis date;
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS iban text DEFAULT 'AT67 1912 0500 9922 3610';
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS bic text DEFAULT 'SPBAATWW';
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS kontoinhaber text DEFAULT 'Günther Neumayr';
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS kontakt_email text DEFAULT 'info@sportmedizin-arlberg.at';
ALTER TABLE kongresse ADD COLUMN IF NOT EXISTS begruessung text;

-- 2. KURSE — Fehlende Felder
ALTER TABLE kurse ADD COLUMN IF NOT EXISTS kurs_gruppe text DEFAULT 'block';
ALTER TABLE kurse ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- 3. TEILNEHMER — kongress_id Verknüpfung
ALTER TABLE teilnehmer ADD COLUMN IF NOT EXISTS kongress_id integer REFERENCES kongresse(id);

-- 4. RECHNUNGEN — eigene Tabelle für alle Rechnungen
CREATE TABLE IF NOT EXISTS public.rechnungen (
  id                    integer NOT NULL DEFAULT nextval('rechnungen_id_seq'::regclass),
  kongress_id           integer REFERENCES kongresse(id),
  teilnehmer_id         integer REFERENCES teilnehmer(id),
  rechnungsnummer       text NOT NULL UNIQUE,
  typ                   text NOT NULL DEFAULT 'teilnehmer', -- 'teilnehmer' | 'sponsor'
  anrede                text DEFAULT 'Damen und Herren',
  gesamtbetrag_brutto   numeric NOT NULL,
  netto                 numeric NOT NULL,
  mwst_betrag           numeric NOT NULL,
  mwst_prozent          numeric NOT NULL DEFAULT 20,
  bezahlt               boolean DEFAULT false,
  erstellt_am           timestamp without time zone DEFAULT now(),
  versendet_am          timestamp without time zone,
  CONSTRAINT rechnungen_pkey PRIMARY KEY (id)
);

-- Sequence für rechnungen falls noch nicht vorhanden
DO $$ BEGIN
  CREATE SEQUENCE IF NOT EXISTS rechnungen_id_seq;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rechnungspositionen
CREATE TABLE IF NOT EXISTS public.rechnungs_positionen (
  id             integer NOT NULL DEFAULT nextval('rechnungs_positionen_id_seq'::regclass),
  rechnung_id    integer NOT NULL REFERENCES rechnungen(id) ON DELETE CASCADE,
  bezeichnung    text NOT NULL,
  menge          integer NOT NULL DEFAULT 1,
  einzelpreis    numeric NOT NULL,
  gesamtpreis    numeric NOT NULL,
  CONSTRAINT rechnungs_positionen_pkey PRIMARY KEY (id)
);

DO $$ BEGIN
  CREATE SEQUENCE IF NOT EXISTS rechnungs_positionen_id_seq;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. SPONSOREN_RECHNUNGEN — rechnungs_id Verknüpfung
ALTER TABLE sponsoren_rechnungen ADD COLUMN IF NOT EXISTS rechnung_id integer REFERENCES rechnungen(id);

-- 6. KONGRESS 2027 DATEN BEFÜLLEN
UPDATE kongresse SET
  ort                  = 'St. Christoph am Arlberg',
  datum_von            = '2027-02-28',
  datum_bis            = '2027-03-05',
  fruehbucher_bis      = '2026-12-31',
  storno_kostenlos_bis = '2026-12-31',
  storno_50_bis        = '2027-01-31',
  iban                 = 'AT67 1912 0500 9922 3610',
  bic                  = 'SPBAATWW',
  kontoinhaber         = 'Günther Neumayr',
  kontakt_email        = 'info@sportmedizin-arlberg.at',
  status               = 'aktiv',
  begruessung          = 'Wir freuen uns darauf, Sie beim 60. Internationalen Kongress für Sportmedizin in St. Christoph am Arlberg begrüßen zu dürfen.'
WHERE id = 2;

-- 7. KURSE BEFÜLLEN
UPDATE kurse SET kurs_gruppe='block', sort_order=1  WHERE id=1;
UPDATE kurse SET kurs_gruppe='block', sort_order=2  WHERE id=2;
UPDATE kurse SET kurs_gruppe='block', sort_order=3  WHERE id=3;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=4  WHERE id=4;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=5  WHERE id=5;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=6  WHERE id=6;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=7  WHERE id=7;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=8  WHERE id=8;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=9  WHERE id=9;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=10 WHERE id=10;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=11 WHERE id=11;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=12 WHERE id=12;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=13 WHERE id=13;
UPDATE kurse SET kurs_gruppe='ps',    sort_order=14 WHERE id=14;
UPDATE kurse SET kurs_gruppe='ts',    sort_order=15 WHERE id=15;

UPDATE kurse SET fruehbucher_bis = '2026-12-31 23:59:59' WHERE kongress_id = 2;

-- 8. RLS POLICIES
ALTER TABLE teilnehmer        ENABLE ROW LEVEL SECURITY;
ALTER TABLE buchungen         ENABLE ROW LEVEL SECURITY;
ALTER TABLE kurse             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kongresse         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechnungen        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rechnungs_positionen ENABLE ROW LEVEL SECURITY;

-- Policies löschen und neu erstellen
DROP POLICY IF EXISTS "public_insert_teilnehmer"     ON teilnehmer;
DROP POLICY IF EXISTS "public_select_teilnehmer"     ON teilnehmer;
DROP POLICY IF EXISTS "public_insert_buchungen"      ON buchungen;
DROP POLICY IF EXISTS "public_select_kurse"          ON kurse;
DROP POLICY IF EXISTS "public_select_kongresse"      ON kongresse;
DROP POLICY IF EXISTS "auth_all_rechnungen"          ON rechnungen;
DROP POLICY IF EXISTS "auth_all_positionen"          ON rechnungs_positionen;
DROP POLICY IF EXISTS "auth_all_buchungen"           ON buchungen;
DROP POLICY IF EXISTS "auth_all_teilnehmer"          ON teilnehmer;

-- Öffentlich (Anmeldeseite)
CREATE POLICY "public_insert_teilnehmer" ON teilnehmer FOR INSERT WITH CHECK (true);
CREATE POLICY "public_select_teilnehmer" ON teilnehmer FOR SELECT USING (true);
CREATE POLICY "public_insert_buchungen"  ON buchungen  FOR INSERT WITH CHECK (true);
CREATE POLICY "public_select_kurse"      ON kurse      FOR SELECT USING (true);
CREATE POLICY "public_select_kongresse"  ON kongresse  FOR SELECT USING (true);

-- Admin (nur eingeloggte User)
CREATE POLICY "auth_all_buchungen"    ON buchungen           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_teilnehmer"   ON teilnehmer          FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_rechnungen"   ON rechnungen          FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_positionen"   ON rechnungs_positionen FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_sponsoren"    ON sponsoren           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_sp_rech"      ON sponsoren_rechnungen FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_kongresse"    ON kongresse           FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "auth_all_kurse"        ON kurse               FOR ALL USING (auth.role() = 'authenticated');

-- 9. KONTROLLE
SELECT 'kongresse' as tabelle, count(*) FROM kongresse
UNION ALL SELECT 'kurse', count(*) FROM kurse WHERE kongress_id = 2
UNION ALL SELECT 'teilnehmer', count(*) FROM teilnehmer
UNION ALL SELECT 'buchungen', count(*) FROM buchungen;

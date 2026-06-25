// Rechnungs-HTML Generator
// Erzeugt A4-HTML das exakt wie die Vorlage aussieht
// Wird im Browser via window.print() als PDF gedruckt

export type RechnungDaten = {
  rechnungsnummer: string
  datum: string
  anrede: string              // 'Damen und Herren' | 'Frau [Name]' | 'Herr [Name]'
  empfaenger_name: string
  empfaenger_zeile2?: string  // z.B. Ansprechperson bei Sponsor
  empfaenger_strasse: string
  empfaenger_plz_ort: string
  empfaenger_land: string
  empfaenger_kennung?: string // ÖÄK-Nr. bei Teilnehmer, UID bei Sponsor
  positionen: { bezeichnung: string; menge: number; einzelpreis: number }[]
  mwst_typ: 'mit_mwst' | 'reverse_charge' | 'nicht_steuerbar'
  bezahlt: boolean
  kongress_name: string
  kongress_jahr: number
  intro_text: string         // Einleitungstext je nach Typ
}

const AUSSTELLER = {
  name: 'Prof. h.c. Univ.-Doz. Dr. Günther Neumayr',
  strasse: 'Michaelsgasse 20',
  plz_ort: '9900 Lienz',
  land: 'Österreich',
  uid: 'ATU 61957546',
  iban: 'AT67 1912 0500 9922 3610',
  bic: 'SPBAATWW',
  bank: 'Bank99',
  tel: '04852 61952-52',
  email: 'info@sportmedizin-arlberg.at',
  website: 'www.sportmedizin-arlberg.at',
  bearbeiterin: 'Dr. iur. Mara Neumayr, MBL',
}

export function buildRechnungHTML(r: RechnungDaten): string {
  // Berechnung
  const gesamtBrutto = r.positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0)
  const netto = r.mwst_typ === 'mit_mwst' ? gesamtBrutto / 1.2 : gesamtBrutto
  const mwst = gesamtBrutto - netto

  const posTR = r.positionen.map((p, i) => `
    <tr>
      <td style="border:1px solid #ddd;padding:5px 7px">${i + 1}.</td>
      <td style="border:1px solid #ddd;padding:5px 7px">${p.bezeichnung}</td>
      <td style="border:1px solid #ddd;padding:5px 7px;text-align:right">${p.menge}</td>
      <td style="border:1px solid #ddd;padding:5px 7px">Stück</td>
      <td style="border:1px solid #ddd;padding:5px 7px;text-align:right">${(p.einzelpreis * (r.mwst_typ === 'mit_mwst' ? 1 : 1)).toFixed(2)}</td>
      <td style="border:1px solid #ddd;padding:5px 7px;text-align:right">${(p.menge * p.einzelpreis).toFixed(2)}</td>
    </tr>`).join('')

  const summenBlock = r.mwst_typ === 'mit_mwst' ? `
    <tr>
      <td style="border:none;font-size:10px;padding:3px 0">Bruttobetrag</td>
      <td style="border:none;text-align:right;font-size:10px;padding:3px 0">${gesamtBrutto.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="border:none;font-size:10px;padding:3px 0">Ust. 20 % inkl.</td>
      <td style="border:none;text-align:right;font-size:10px;padding:3px 0">${mwst.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="border:none;font-weight:bold;font-size:12px;padding:5px 0;border-top:2px solid #111">Rechnungsbetrag</td>
      <td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:5px 0;border-top:2px solid #111">${gesamtBrutto.toFixed(2)}</td>
    </tr>` : r.mwst_typ === 'reverse_charge' ? `
    <tr>
      <td style="border:none;font-weight:bold;font-size:12px;padding:5px 0;border-top:2px solid #111">Rechnungsbetrag netto</td>
      <td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:5px 0;border-top:2px solid #111">${netto.toFixed(2)}</td>
    </tr>` : `
    <tr>
      <td style="border:none;font-weight:bold;font-size:12px;padding:5px 0;border-top:2px solid #111">Rechnungsbetrag netto</td>
      <td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:5px 0;border-top:2px solid #111">${netto.toFixed(2)}</td>
    </tr>`

  const steuerHinweis = r.mwst_typ === 'reverse_charge'
    ? `<p style="font-size:10px;margin-top:8px">Die Umsatzsteuer wird vom Leistungsempfänger geschuldet (Reverse-Charge-Verfahren).</p>`
    : r.mwst_typ === 'nicht_steuerbar'
    ? `<p style="font-size:10px;margin-top:8px">Nicht steuerbar gem. § 3a UStG.</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Rechnung ${r.rechnungsnummer}</title>
<style>
  @page { size: A4; margin: 18mm 20mm 25mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: white; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .footer { margin-top: 20mm; border-top: 1px solid #ccc; padding-top: 5px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 9px; color: #555; }
</style>
</head>
<body>

<!-- HEADER -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14mm">
  <div style="font-size:9px;color:#888;line-height:1.6">${AUSSTELLER.name} · ${AUSSTELLER.strasse} · ${AUSSTELLER.plz_ort}</div>
  <img src="/logo.svg" style="height:20mm;width:auto" alt="Sportmedizin Arlberg Logo" />
</div>

<!-- DATUM + BEARBEITERIN -->
<div style="text-align:right;margin-bottom:8mm;font-size:10px;line-height:1.9;color:#444">
  <div>${r.datum}</div>
  <div>Bearbeiterin: ${AUSSTELLER.bearbeiterin}</div>
  <div>E-Mail: ${AUSSTELLER.email}</div>
</div>

<!-- EMPFÄNGER -->
<div style="margin-bottom:8mm;font-size:10px;line-height:1.8">
  <div style="font-weight:bold">${r.empfaenger_name}</div>
  ${r.empfaenger_zeile2 ? `<div>${r.empfaenger_zeile2}</div>` : ''}
  <div>${r.empfaenger_strasse}</div>
  <div>${r.empfaenger_plz_ort}</div>
  ${r.empfaenger_kennung ? `<div style="margin-top:3px">${r.empfaenger_kennung}</div>` : ''}
</div>

<!-- TITEL -->
<div style="margin-bottom:5mm">
  <div style="font-size:15px;font-weight:bold;margin-bottom:3px">Rechnung für die Teilnahme</div>
  <div style="font-size:11px;font-weight:bold">zum ${r.kongress_name} ${r.kongress_jahr}</div>
</div>

<!-- RECHNUNGSNUMMER -->
<div style="margin-bottom:5mm;font-size:10px">
  Rechnungsnummer: <strong>${r.rechnungsnummer}</strong>
</div>

<!-- ANREDE + TEXT -->
<div style="margin-bottom:6mm;font-size:10px;line-height:1.7">
  <p>Sehr geehrte${r.anrede === 'Damen und Herren' ? '' : 'r'} ${r.anrede},</p>
  <br>
  <p>${r.intro_text}</p>
</div>

<!-- POSITIONEN -->
<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm">
  <thead>
    <tr style="background:#f5f5f5">
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:left;font-size:9px;width:5%">Pos.</th>
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:left;font-size:9px">Bezeichnung</th>
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:right;font-size:9px;width:8%">Menge</th>
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:left;font-size:9px;width:8%">Einheit</th>
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:right;font-size:9px;width:12%">Einzelpreis</th>
      <th style="border:1px solid #ddd;padding:5px 7px;text-align:right;font-size:9px;width:12%">Gesamtpreis</th>
    </tr>
  </thead>
  <tbody>${posTR}</tbody>
</table>

<!-- SUMMEN -->
<div style="display:flex;justify-content:flex-end;margin-bottom:5mm">
  <table style="width:200px;border-collapse:collapse">${summenBlock}</table>
</div>

${steuerHinweis}

<!-- BEZAHLT -->
${r.bezahlt ? `<div style="font-size:13px;font-weight:bold;margin:6mm 0">Ihre Zahlung wurde dankend erhalten.</div>` : ''}

<!-- GRUSS -->
<div style="font-size:10px;line-height:1.9;margin-top:10mm">
  <p>Mit sportlichen Grüßen</p>
  <br><br>
  <p style="font-weight:bold;font-style:italic">${AUSSTELLER.name}</p>
  <p>Kongresspräsident</p>
</div>

<!-- FOOTER -->
<div class="footer">
  <div>
    <div>${AUSSTELLER.name}</div>
    <div>${AUSSTELLER.strasse}</div>
    <div>${AUSSTELLER.plz_ort}</div>
    <div>${AUSSTELLER.land}</div>
    <div>UID: ${AUSSTELLER.uid}</div>
  </div>
  <div>
    <div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div>
    <div>Inhaber: Günther Neumayr</div>
    <div>Bank: ${AUSSTELLER.bank}</div>
    <div>IBAN: ${AUSSTELLER.iban}</div>
    <div>BIC: ${AUSSTELLER.bic}</div>
  </div>
  <div>
    <div style="font-weight:bold;margin-bottom:3px">Kontakt</div>
    <div>Tel.: ${AUSSTELLER.tel}</div>
    <div>E-Mail: ${AUSSTELLER.email}</div>
    <div>Website: ${AUSSTELLER.website}</div>
  </div>
</div>

</body>
</html>`
}

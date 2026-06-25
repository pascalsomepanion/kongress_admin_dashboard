export type RechnungDaten = {
  rechnungsnummer: string
  datum: string
  anrede: string
  empfaenger_name: string
  empfaenger_zeile2?: string
  empfaenger_strasse: string
  empfaenger_plz_ort: string
  empfaenger_land: string
  empfaenger_kennung?: string
  positionen: { bezeichnung: string; menge: number; einzelpreis: number }[]
  mwst_typ: 'mit_mwst' | 'reverse_charge' | 'nicht_steuerbar'
  bezahlt: boolean
  kongress_name: string
  kongress_jahr: number
  intro_text: string
  ohne_tabelle?: boolean
}

const A = {
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
  const gesamtBrutto = r.positionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0)
  const netto = r.mwst_typ === 'mit_mwst' ? gesamtBrutto / 1.2 : gesamtBrutto
  const mwst = gesamtBrutto - netto

  const posTR = r.positionen.map((p, i) => `
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${i + 1}.</td>
      <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">${p.bezeichnung}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;font-size:10px">${p.menge}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;font-size:10px">Stück</td>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px">${p.einzelpreis.toFixed(2)}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:10px">${(p.menge * p.einzelpreis).toFixed(2)}</td>
    </tr>`).join('')

  const summenBlock = r.mwst_typ === 'mit_mwst' ? `
    <tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Nettobetrag</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0">${netto.toFixed(2)}</td></tr>
    <tr><td style="border:none;font-size:10px;padding:4px 0;color:#555">Ust. 20 % inkl.</td><td style="border:none;text-align:right;font-size:10px;padding:4px 0">${mwst.toFixed(2)}</td></tr>
    <tr><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0 4px;border-top:2px solid #111">Rechnungsbetrag</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0 4px;border-top:2px solid #111">${gesamtBrutto.toFixed(2)}</td></tr>`
  : `<tr><td style="border:none;font-weight:bold;font-size:12px;padding:6px 0;border-top:2px solid #111">Rechnungsbetrag netto</td><td style="border:none;text-align:right;font-weight:bold;font-size:14px;padding:6px 0;border-top:2px solid #111">${netto.toFixed(2)}</td></tr>`

  const steuerHinweis = r.mwst_typ === 'reverse_charge'
    ? `<p style="font-size:10px;margin-top:6mm;color:#555">Die Umsatzsteuer wird vom Leistungsempfänger geschuldet (Reverse-Charge-Verfahren).</p>`
    : r.mwst_typ === 'nicht_steuerbar'
    ? `<p style="font-size:10px;margin-top:6mm;color:#555">Nicht steuerbar gem. § 3a UStG.</p>`
    : ''

  // Kongress-Titel ohne doppeltes Jahr
  const kongressTitel = r.kongress_name.includes(String(r.kongress_jahr))
    ? r.kongress_name
    : `${r.kongress_name} ${r.kongress_jahr}`

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Rechnung ${r.rechnungsnummer}</title>
<style>
  @page { size: A4; margin: 15mm 20mm 20mm 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: white; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- HEADER: Logo + Datum/Bearbeiterin nebeneinander -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8mm">
  <div style="flex:1"></div>
  <div style="text-align:right">
    <img src="/logo.svg" style="height:18mm;width:auto;display:block;margin-left:auto;margin-bottom:6px" alt="Logo"/>
    <div style="font-size:10px;line-height:1.8;color:#333">
      <div>${r.datum}</div>
      <div>Bearbeiterin: ${A.bearbeiterin}</div>
      <div>E-Mail: ${A.email}</div>
    </div>
  </div>
</div>

<!-- EMPFÄNGER -->
<div style="margin-bottom:7mm;font-size:10px;line-height:1.8">
  <div style="font-weight:bold;font-size:11px">${r.empfaenger_name}</div>
  ${r.empfaenger_zeile2 ? `<div>${r.empfaenger_zeile2}</div>` : ''}
  <div>${r.empfaenger_strasse}</div>
  <div>${r.empfaenger_plz_ort}</div>
  ${r.empfaenger_kennung ? `<div style="margin-top:2px;color:#555">${r.empfaenger_kennung}</div>` : ''}
</div>

<!-- TITEL -->
<div style="margin-bottom:4mm">
  <div style="font-size:16px;font-weight:bold">Rechnung für die Teilnahme</div>
  <div style="font-size:11px;font-weight:bold;margin-top:2px">zum ${kongressTitel}</div>
</div>

<!-- RECHNUNGSNUMMER -->
<div style="margin-bottom:5mm;font-size:10px;color:#333">
  Rechnungsnummer: <strong>${r.rechnungsnummer}</strong>
</div>

<!-- ANREDE + TEXT -->
<div style="margin-bottom:5mm;font-size:10px;line-height:1.7">
  <p>Sehr geehrte${r.anrede === 'Damen und Herren' ? '' : 'r'} ${r.anrede},</p>
  <br>
  <p>${r.intro_text}</p>
</div>

<!-- POSITIONEN -->
${r.ohne_tabelle ? `
<div style="margin-bottom:5mm;font-size:10px;padding:10px 0;border-bottom:1px solid #e0e0e0">
  ${r.positionen.map(p => `<p style="font-weight:600;font-size:11px">${p.bezeichnung}</p>`).join('')}
</div>
` : `
<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:5mm">
  <thead>
    <tr style="background:#f0f0f0">
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:5%">Pos.</th>
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Bezeichnung</th>
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:center;width:8%">Menge</th>
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:left;width:8%">Einheit</th>
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Einzelpreis</th>
      <th style="border:1px solid #ccc;padding:6px 10px;text-align:right;width:13%">Gesamtpreis</th>
    </tr>
  </thead>
  <tbody>${posTR}</tbody>
</table>`}

<!-- SUMMEN -->
<div style="display:flex;justify-content:flex-end;margin-bottom:5mm">
  <table style="width:220px;border-collapse:collapse">${summenBlock}</table>
</div>

${steuerHinweis}

<!-- BEZAHLT -->
${r.bezahlt ? `<div style="font-size:13px;font-weight:bold;margin:5mm 0">Ihre Zahlung wurde dankend erhalten.</div>` : ''}

<!-- GRUSS -->
<div style="font-size:10px;line-height:1.9;margin-top:8mm">
  <p>Mit sportlichen Grüßen</p>
  <br><br>
  <p style="font-weight:bold;font-style:italic">${A.name}</p>
  <p>Kongresspräsident</p>
</div>

<!-- FOOTER -->
<div style="margin-top:auto;padding-top:5mm;border-top:1px solid #ccc;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:9px;color:#555;position:fixed;bottom:10mm;left:20mm;right:20mm">
  <div>
    <div style="font-weight:bold;margin-bottom:3px">${A.name}</div>
    <div>${A.strasse}</div>
    <div>${A.plz_ort} · ${A.land}</div>
    <div>UID: ${A.uid}</div>
  </div>
  <div>
    <div style="font-weight:bold;margin-bottom:3px">Bankverbindung</div>
    <div>Inhaber: Günther Neumayr</div>
    <div>Bank: ${A.bank}</div>
    <div>IBAN: ${A.iban}</div>
    <div>BIC: ${A.bic}</div>
  </div>
  <div>
    <div style="font-weight:bold;margin-bottom:3px">Kontakt</div>
    <div>Tel.: ${A.tel}</div>
    <div>E-Mail: ${A.email}</div>
    <div>Website: ${A.website}</div>
  </div>
</div>

</body>
</html>`
}

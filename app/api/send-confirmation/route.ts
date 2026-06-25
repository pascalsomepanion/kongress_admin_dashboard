import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    const{email,vorname,nachname,strasse,hausnummer,postleitzahl,stadt,land,oeak_nr,ist_oegsmp_mitglied,kongress_name,kongress_jahr,kongress_datum,kongress_start,kongress_ende,iban,bic,kontoinhaber,kontakt_email,gebuchte_kurse,gesamtbetrag,fruehbucher_bis,storno_kostenlos_bis,storno_50_bis,sekretariat_zeiten}=body

    const kursRows=(gebuchte_kurse as {titel:string;uhrzeit:string;preis:number}[]).map(k=>`
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;font-weight:600">${k.titel}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:11px;color:#666">${k.uhrzeit}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:12px;font-weight:700;text-align:right">EUR ${k.preis.toFixed(2)}</td>
      </tr>`).join('')

    const zeiten=(sekretariat_zeiten??'').replace(/\n/g,'<br>')

    const html=`<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;max-width:680px;margin:0 auto;padding:20px;line-height:1.6">

<div style="background:#FFBF00;padding:20px 30px;border-radius:8px 8px 0 0">
  <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.45);margin:0 0 4px">Anmeldebestätigung</p>
  <h1 style="font-size:18px;font-weight:800;color:#111;margin:0">Willkommen zum ${kongress_name} ${kongress_jahr}</h1>
  <p style="font-size:12px;color:rgba(0,0,0,.55);margin:4px 0 0">${kongress_datum}</p>
</div>

<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:28px 30px">

  <p>Herzlich Willkommen zum ${kongress_name} ${kongress_jahr}!</p>
  <p style="margin-top:10px">Wir freuen uns über Ihre Teilnahme und Ihr Interesse an der Sportmedizin. Mit Recht und Stolz kann man sagen, dass dieser Kongress seit Jahrzehnten nicht nur der traditionsreichste, sondern auch größte und renommierteste auf dem Gebiet der Sportmedizin innerhalb Österreichs ist.</p>
  <p style="margin-top:10px">Das wissenschaftliche Programm finden Sie auf unserer Homepage <a href="https://www.sportmedizin-arlberg.at" style="color:#B45309">www.sportmedizin-arlberg.at</a></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <div style="background:#f8f9fa;border-radius:8px;padding:16px 20px;margin-bottom:16px">
    <h3 style="font-size:13px;font-weight:700;margin-bottom:12px;color:#111">📅 Wichtige Informationen zum Kongress</h3>
    <table style="font-size:12px;border-collapse:collapse;width:100%">
      <tr><td style="color:#888;padding:4px 0;width:160px;vertical-align:top">Start</td><td style="font-weight:600;padding:4px 0">${kongress_start}</td></tr>
      <tr><td style="color:#888;padding:4px 0;vertical-align:top">Ende</td><td style="font-weight:600;padding:4px 0">${kongress_ende}</td></tr>
      <tr><td style="color:#888;padding:4px 0;vertical-align:top">Tagungsort</td><td style="font-weight:600;padding:4px 0">Ski Academy Austria, St. Christoph am Arlberg</td></tr>
      <tr><td style="color:#888;padding:4px 0;vertical-align:top">Sekretariat</td><td style="font-weight:600;padding:4px 0">${zeiten}</td></tr>
    </table>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <p>Um Ihre Anmeldung zu finalisieren, bitten wir Sie die Kongressgebühr zeitnah auf das untenstehende Konto einzuzahlen. Nach Eingang erhalten Sie per E-Mail Ihre Rechnung inkl. Zahlungsbestätigung.</p>

  <div style="background:#FFF9E6;border:1px solid #FFE082;border-radius:8px;padding:16px 20px;margin:16px 0">
    <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B45309;margin:0 0 10px">Zahlungsinformationen</p>
    <table style="font-size:12px;border-collapse:collapse;width:100%">
      <tr><td style="color:#888;padding:4px 0;width:160px">IBAN</td><td style="font-family:monospace;font-weight:600">${iban}</td></tr>
      <tr><td style="color:#888;padding:4px 0">Kontoinhaber</td><td>${kontoinhaber}</td></tr>
      <tr><td style="color:#888;padding:4px 0">Verwendungszweck</td><td style="font-weight:700;color:#B45309">${vorname} ${nachname}</td></tr>
      <tr><td style="color:#888;padding:4px 0">BIC</td><td style="font-family:monospace">${bic}</td></tr>
      <tr style="border-top:1px solid #FFE082"><td style="color:#888;padding:8px 0 4px;font-weight:700">Zu überweisender Betrag</td><td style="font-weight:800;font-size:16px;color:#B45309;padding-top:8px">EUR ${(gesamtbetrag as number).toFixed(2)}</td></tr>
    </table>
  </div>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:10px">🎓 Ihre gebuchten Kurse</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
    <thead><tr style="background:#f5f5f5">
      <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:11px;font-weight:700">Kurs</th>
      <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:11px;font-weight:700">Datum & Uhrzeit</th>
      <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-size:11px;font-weight:700">Betrag</th>
    </tr></thead>
    <tbody>${kursRows}</tbody>
    <tfoot><tr style="background:#f5f5f5">
      <td colspan="2" style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:700;font-size:12px">Gesamtbetrag</td>
      <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:800;font-size:14px;text-align:right;color:#B45309">EUR ${(gesamtbetrag as number).toFixed(2)}</td>
    </tr></tfoot>
  </table>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:10px">👤 Ihre persönlichen Daten</h3>
  <table style="font-size:12px;border-collapse:collapse;width:100%">
    <tr><td style="color:#888;padding:4px 0;width:160px">Name</td><td style="font-weight:600">${vorname} ${nachname}</td></tr>
    <tr><td style="color:#888;padding:4px 0">Adresse</td><td style="font-weight:600">${strasse} ${hausnummer}, ${postleitzahl} ${stadt}, ${land}</td></tr>
    <tr><td style="color:#888;padding:4px 0">ÖÄK-Nr.</td><td style="font-weight:600">${oeak_nr}</td></tr>
    <tr><td style="color:#888;padding:4px 0">E-Mail</td><td style="font-weight:600">${email}</td></tr>
    <tr><td style="color:#888;padding:4px 0">ÖGSMP-Mitglied</td><td style="font-weight:600">${ist_oegsmp_mitglied?'Ja':'Nein'}</td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin-top:8px">Bei Eingabefehlern bitten wir um unverzügliche Rückmeldung an <a href="mailto:${kontakt_email}" style="color:#B45309">${kontakt_email}</a></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:10px">ℹ️ Wichtige Hinweise</h3>
  <table style="border-collapse:collapse;width:100%;font-size:12px">
    <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#888;width:180px;vertical-align:top">Änderungen</td><td style="padding:7px 0">Bei Änderungswünschen direkt an <a href="mailto:${kontakt_email}" style="color:#B45309">${kontakt_email}</a> wenden — keine erneute Buchung vornehmen.</td></tr>
    <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#888;vertical-align:top">Frühbucherbonus</td><td style="padding:7px 0">Gilt bei Zahlungseingang bis <strong>${fruehbucher_bis}</strong>.</td></tr>
    <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#888;vertical-align:top">Stornogebühr</td><td style="padding:7px 0">Bis ${storno_kostenlos_bis}: kostenlos · Bis ${storno_50_bis}: 50% Rückerstattung · Danach: keine Rückerstattung.</td></tr>
    <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#888;vertical-align:top">Anwesenheit</td><td style="padding:7px 0">Wird kontrolliert und ist Voraussetzung für die Anerkennung der DFP-Punkte.</td></tr>
    <tr style="border-bottom:1px solid #f0f0f0"><td style="padding:7px 0;color:#888;vertical-align:top">DFP</td><td style="padding:7px 0">Volle Punkte nur bei vollständiger Anwesenheit. Steuerliche Absetzbarkeit bei mind. 8 Stunden Nachweis.</td></tr>
    <tr><td style="padding:7px 0;color:#888;vertical-align:top">Zimmerreservierung</td><td style="padding:7px 0"><a href="https://www.skiakademie.at" style="color:#B45309">www.skiakademie.at</a></td></tr>
  </table>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <p>Wir freuen uns auf einen erfolgreichen Kongress und verbleiben mit sportlichem Gruß!</p>
  <p style="margin-top:16px"><strong>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</strong><br><span style="color:#888;font-size:12px">Kongresspräsident</span></p>
  <p style="margin-top:8px"><strong>Dr. iur. Mara Neumayr, MBL</strong><br><span style="color:#888;font-size:12px">Kongresssekretariat</span><br><a href="mailto:${kontakt_email}" style="color:#B45309;font-size:12px">${kontakt_email}</a></p>
</div>
</body></html>`

    await resend.emails.send({
      from:'info@sportmedizin-arlberg.at',
      to:email, bcc:kontakt_email,
      subject:'Anmeldebestätigung ' + kongress_name + ' ' + kongress_jahr,
      html,
    })
    return NextResponse.json({ok:true})
  }catch(e){
    console.error(e)
    return NextResponse.json({error:String(e)},{status:500})
  }
}

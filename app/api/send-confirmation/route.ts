import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)

    const{
      email,vorname,nachname,kongress_name,kongress_jahr,kongress_datum,
      kongress_start,kongress_ende,iban,bic,kontoinhaber,kontakt_email,
      kurs_titel,gesamtbetrag,oeak_nr,ist_oegsmp_mitglied,
      fruehbucher_bis,storno_kostenlos_bis,storno_50_bis
    }=body

    // Kursübersicht Tabelle
    const alleKurse=[
      {key:'LIP GK',label:'LIP GK (Leistungsphysiologisch Internistisch Paediatrischer Grundkurs)'},
      {key:'Work-Shop',label:'Workshop'},
      {key:'Reinhard Suckert',label:'RSS (Reinhard Suckert Symposium)'},
      {key:'TS1',label:'TS 1'},{key:'TS2',label:'TS 2'},{key:'TS3',label:'TS 3'},
      {key:'TS4',label:'TS 4'},{key:'TS5',label:'TS 5'},{key:'TS6',label:'TS 6'},
      {key:'PS1',label:'PS 1'},{key:'PS2',label:'PS 2'},{key:'PS3',label:'PS 3'},
      {key:'PS4',label:'PS 4'},{key:'PS5',label:'PS 5'},{key:'PS6',label:'PS 6'},
    ]
    const kursRows=alleKurse.map(k=>{
      const gebucht=(kurs_titel as string[]).some((t:string)=>t.includes(k.key))
      return `<tr>
        <td style="padding:5px 10px;border:1px solid #e5e7eb;font-size:12px">${k.label}</td>
        <td style="padding:5px 10px;border:1px solid #e5e7eb;text-align:center;font-size:14px">${gebucht?'<span style="color:#16a34a;font-weight:bold">&#10003;</span>':''}</td>
      </tr>`
    }).join('')

    const html=`<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#111;max-width:680px;margin:0 auto;padding:20px;line-height:1.6">

<div style="background:#FFBF00;padding:20px 30px;border-radius:8px 8px 0 0;margin-bottom:0">
  <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.5);margin:0 0 4px">Anmeldebestaetigung</p>
  <h1 style="font-size:18px;font-weight:800;color:#111;margin:0">Willkommen zum ${kongress_name}</h1>
  <p style="font-size:12px;color:rgba(0,0,0,.55);margin:4px 0 0">vom ${kongress_datum}</p>
</div>

<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:28px 30px">

  <p>Herzlich Willkommen zum ${kongress_name}!</p>
  <p style="margin-top:10px">Wir freuen uns ueber Ihre Teilnahme und Ihr Interesse an der Sportmedizin. Mit Recht und Stolz kann man sagen, dass dieser Kongress seit Jahrzehnten nicht nur der traditionsreichste, sondern auch groesste und renommierteste auf dem Gebiet der Sportmedizin innerhalb Oesterreichs ist. Interessante Vortraege, interaktive Workshops und spannende Diskussionen erwarten Sie.</p>
  <p style="margin-top:10px">Das wissenschaftliche Programm finden Sie auf unserer Homepage <a href="https://www.sportmedizin-arlberg.at" style="color:#B45309">www.sportmedizin-arlberg.at</a></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:8px">Wichtige Informationen zum Kongress:</h3>
  <p><strong>Start:</strong> ${kongress_start}</p>
  <p><strong>Ende:</strong> ${kongress_ende}</p>
  <p><strong>Tagungsort:</strong> Ski Academy Austria St. Christoph am Arlberg</p>

  <p style="margin-top:12px"><strong>Oeffnungszeiten des Kongress-Sekretariates:</strong><br>
  Sonntag: Nachmittag 15:00-17:00 und 18:00-20:00 Uhr<br>
  Montag bis Freitag: Vormittag 07:45-08:15 und 09:15-09:45 Uhr / Nachmittag 16:30-17:00 und 18:15-18:45 Uhr</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <p>Um Ihre Anmeldung zu finalisieren, bitten wir Sie die Kongressgebuehr zeitnah auf das untenstehende Konto einzuzahlen. Nach Eingang erhalten Sie per E-Mail Ihre Rechnung inkl. Zahlungsbestaetigung.</p>

  <div style="background:#FFF9E6;border:1px solid #FFE082;border-radius:8px;padding:16px 20px;margin:16px 0">
    <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B45309;margin:0 0 10px">Zahlungsinformationen</p>
    <table style="font-size:12px;border-collapse:collapse;width:100%">
      <tr><td style="color:#888;padding:3px 0;width:160px">IBAN</td><td style="font-family:monospace;font-weight:600">${iban}</td></tr>
      <tr><td style="color:#888;padding:3px 0">Kontoinhaber</td><td>${kontoinhaber}</td></tr>
      <tr><td style="color:#888;padding:3px 0">Verwendungszweck</td><td style="font-weight:700;color:#B45309">${vorname} ${nachname}</td></tr>
      <tr><td style="color:#888;padding:3px 0">BIC</td><td style="font-family:monospace">${bic}</td></tr>
      <tr style="border-top:1px solid #FFE082"><td style="color:#888;padding:6px 0 3px;font-weight:700">Zu ueberweisender Betrag</td><td style="font-weight:800;font-size:15px;color:#B45309;padding-top:6px">EUR ${(gesamtbetrag as number).toFixed(2)}</td></tr>
    </table>
  </div>

  <p style="font-size:12px;color:#666">Bitte beachten Sie, dass die definitive Anmeldung erst mit dem vollstaendigen Zahlungseingang eintritt. Die Vergabe der limitierten Seminarplaetze erfolgt in der Reihenfolge des Einlangens der gesamten Teilnahmegebuehr.</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:10px">Kursuebersicht:</h3>
  <table style="border-collapse:collapse;width:100%;margin-bottom:8px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:left;font-size:11px;font-weight:700">Kurs</th>
        <th style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;font-size:11px;font-weight:700;width:80px">gebucht</th>
      </tr>
    </thead>
    <tbody>${kursRows}</tbody>
  </table>
  <p style="font-size:11px;color:#888">*Abkuerzungen: LIP GK: Leistungsphysiologisch Internistisch Paediatrischer Grundkurs, RSS: Reinhard Suckert Symposium, TS: Theorieseminar, PS: Praxisseminar</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:8px">Ihre persoenlichen Daten (bitte um Kontrolle):</h3>
  <table style="font-size:12px;border-collapse:collapse">
    <tr><td style="color:#888;padding:3px 10px 3px 0;width:140px">Name</td><td style="font-weight:600">${vorname} ${nachname}</td></tr>
    <tr><td style="color:#888;padding:3px 10px 3px 0">OeAK Nr.</td><td style="font-weight:600">${oeak_nr}</td></tr>
    <tr><td style="color:#888;padding:3px 10px 3px 0">Aktives OEGSMP Mitglied</td><td style="font-weight:600">${ist_oegsmp_mitglied?'Ja':'Nein'}</td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin-top:8px">Bei Eingabefehlern bitten wir um unverzuegliche Rueckmeldung an <a href="mailto:${kontakt_email}" style="color:#B45309">${kontakt_email}</a></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <h3 style="font-size:13px;font-weight:700;margin-bottom:10px">Wichtige Hinweise:</h3>

  <p><strong>Aenderungen und nachtraegliche Buchungen:</strong> Bei Aenderungswuenschen oder zustaetzlichen Buchungen bitten wir Sie, direkt mit unserem Kongresssekretariat unter <a href="mailto:${kontakt_email}" style="color:#B45309">${kontakt_email}</a> in Kontakt zu treten und keine erneute Buchung vorzunehmen.</p>

  <p style="margin-top:10px"><strong>Fruehbucherbonus:</strong> Gilt bei Zahlungseingang bis ${fruehbucher_bis}. Anschliessend wird der Normaltarif verrechnet.</p>

  <p style="margin-top:10px"><strong>Stornogebuehr:</strong> Bis ${storno_kostenlos_bis}: keine Stornogebuehr. Zwischen 01.01. und ${storno_50_bis}: 50% Rueckerstattung. Ab danach keine Rueckerstattung moeglich.</p>

  <p style="margin-top:10px"><strong>Anwesenheit:</strong> Ihre Anwesenheit wird kontrolliert und ist Voraussetzung fuer die Anerkennung der DFPs.</p>

  <p style="margin-top:10px"><strong>DFP-Anrechenbarkeit:</strong> Die DFPs werden in voller Hoehe nur bei vollstaendiger Anwesenheit vergeben. Steuerliche Absetzbarkeit bei mind. 8 Stunden Nachweis (Grundkurs, Theorie, Praxis).</p>

  <p style="margin-top:10px"><strong>Zimmerreservierung:</strong> Zimmer koennen in der Ski Austria Academy reserviert werden. Details: <a href="https://www.skiakademie.at" style="color:#B45309">www.skiakademie.at</a></p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">

  <p>Wir freuen uns auf einen erfolgreichen Kongress zusammen mit Ihnen und verbleiben mit sportlichem Gruss!</p>

  <p style="margin-top:16px">
    <strong>Prof. h.c. Univ.-Doz. Dr. Guenther Neumayr</strong><br>
    <span style="color:#888;font-size:12px">Kongresspräsident</span>
  </p>
  <p style="margin-top:8px">
    <strong>Dr. iur. Mara Neumayr, MBL</strong><br>
    <span style="color:#888;font-size:12px">Kongresssekretariat</span><br>
    <a href="mailto:${kontakt_email}" style="color:#B45309;font-size:12px">${kontakt_email}</a>
  </p>

</div>
</body>
</html>`

    await resend.emails.send({
      from:'anmeldung@sportmedizin-arlberg.at',
      to:email,
      bcc:kontakt_email,
      subject:'Anmeldebestaetigung '+kongress_name+' '+kongress_jahr,
      html,
    })
    return NextResponse.json({ok:true})
  }catch(e){
    console.error(e)
    return NextResponse.json({error:String(e)},{status:500})
  }
}

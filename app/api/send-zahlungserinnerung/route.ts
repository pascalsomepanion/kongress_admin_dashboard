import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{email,vorname,nachname,betrag,kurse,kongress_name,kongress_jahr,iban,bic,kontoinhaber,kontakt_email}=body
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    const kursRows=(kurse as string[]).map(k=>`<li style="padding:4px 0;color:#374151">${k}</li>`).join('')
    const html=`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;font-size:13px;color:#111;max-width:600px;margin:0 auto;padding:20px;line-height:1.6">
<div style="background:#f59e0b;padding:16px 24px;border-radius:8px 8px 0 0">
  <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.5);margin:0 0 4px">Zahlungserinnerung</p>
  <h1 style="font-size:16px;font-weight:800;color:#111;margin:0">${kongress_name} ${kongress_jahr}</h1>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p>Sehr geehrte/r ${vorname} ${nachname},</p>
  <p style="margin-top:12px">vielen Dank für Ihre Anmeldung zum ${kongress_name} ${kongress_jahr}. Wir möchten Sie freundlich daran erinnern, dass Ihre Zahlung noch aussteht.</p>
  <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:16px;margin:16px 0">
    <p style="font-weight:700;margin:0 0 8px">Offener Betrag: EUR ${Number(betrag).toFixed(2)}</p>
    <ul style="margin:0;padding-left:20px">${kursRows}</ul>
  </div>
  <p style="font-weight:700;margin-top:16px">Bitte überweisen Sie den Betrag auf folgendes Konto:</p>
  <table style="margin-top:8px;font-size:12px">
    <tr><td style="padding:3px 16px 3px 0;color:#6b7280">IBAN</td><td style="font-family:monospace;font-weight:600">${iban}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#6b7280">BIC</td><td style="font-family:monospace;font-weight:600">${bic}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Kontoinhaber</td><td style="font-weight:600">${kontoinhaber}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Verwendungszweck</td><td style="font-weight:600;color:#d97706">${vorname} ${nachname}</td></tr>
    <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Betrag</td><td style="font-weight:700;color:#d97706">EUR ${Number(betrag).toFixed(2)}</td></tr>
  </table>
  <p style="margin-top:16px;color:#6b7280;font-size:12px">Bei Fragen wenden Sie sich bitte an: <a href="mailto:${kontakt_email}" style="color:#d97706">${kontakt_email}</a></p>
  <p style="margin-top:16px">Mit sportlichen Grüßen<br><br><strong>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</strong><br>Kongresspräsident</p>
</div>
</body></html>`
    await resend.emails.send({from:'info@sportmedizin-arlberg.at',to:email,subject:`Zahlungserinnerung — ${kongress_name} ${kongress_jahr}`,html})
    return NextResponse.json({ok:true})
  }catch(e){
    return NextResponse.json({error:String(e)},{status:500})
  }
}


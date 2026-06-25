import{NextRequest,NextResponse}from'next/server'
import{Resend}from'resend'
const resend=new Resend(process.env.RESEND_API_KEY)
export async function POST(req:NextRequest){
  const{email,vorname,nachname,kongress_name,kongress_datum,iban,bic,kontoinhaber,kontakt_email,kurs_titel,gesamtbetrag}=await req.json()
  const kurse=(kurs_titel as string[]).map(k=>`<li style="padding:3px 0">${k}</li>`).join('')
  const{error}=await resend.emails.send({
    from:`${kongress_name} <anmeldung@sportmedizin-arlberg.at>`,
    to:email,bcc:kontakt_email,
    subject:`Anmeldebestaetigung - ${kongress_name}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#FFBF00;padding:28px 36px;border-radius:10px 10px 0 0">
        <p style="font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(0,0,0,.45);margin:0 0 4px">${kongress_name}</p>
        <h1 style="font-size:20px;font-weight:800;color:#111;margin:0">Anmeldebestaetigung</h1>
        <p style="font-size:12px;color:rgba(0,0,0,.5);margin:4px 0 0">${kongress_datum}</p>
      </div>
      <div style="padding:28px 36px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
        <p style="font-size:14px;margin:0 0 6px">Sehr geehrte/r ${vorname} ${nachname},</p>
        <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 20px">vielen Dank fuer Ihre Anmeldung. Bitte ueberweisen Sie den Gesamtbetrag auf das untenstehende Konto. Nach Zahlungseingang erhalten Sie eine Rechnung.</p>
        <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#999;margin:0 0 8px">Gebuchte Kurse</p>
        <ul style="padding-left:18px;margin:0 0 20px;line-height:1.9;font-size:13px">${kurse}</ul>
        <div style="background:#FFF9E6;border:1px solid #FFE082;border-radius:10px;padding:18px 22px;margin:0 0 20px">
          <p style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#B45309;margin:0 0 12px">Zahlungsinformationen</p>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <tr><td style="color:#999;padding:3px 0;width:130px">Betrag</td><td style="font-weight:800;font-size:16px;color:#B45309">EUR ${(gesamtbetrag as number).toFixed(2)}</td></tr>
            <tr><td style="color:#999;padding:3px 0">IBAN</td><td style="font-family:monospace;font-weight:600">${iban}</td></tr>
            <tr><td style="color:#999;padding:3px 0">BIC</td><td style="font-family:monospace">${bic}</td></tr>
            <tr><td style="color:#999;padding:3px 0">Kontoinhaber</td><td>${kontoinhaber}</td></tr>
            <tr><td style="color:#999;padding:3px 0">Verwendungszweck</td><td style="font-weight:700;color:#B45309">${vorname} ${nachname}</td></tr>
          </table>
        </div>
        <p style="font-size:11px;color:#999;line-height:1.6;margin:0">Fragen? <a href="mailto:${kontakt_email}" style="color:#B45309;font-weight:600">${kontakt_email}</a></p>
      </div>
    </div>`,
  })
  if(error){console.error(error);return NextResponse.json({error},{status:500})}
  return NextResponse.json({ok:true})
}

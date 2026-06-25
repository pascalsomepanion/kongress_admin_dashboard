import{NextRequest,NextResponse}from'next/server'
import{Resend}from'resend'
const resend=new Resend(process.env.RESEND_API_KEY)
export async function POST(req:NextRequest){
  const{email,vorname,nachname,rechnungsnummer,kongress_name}=await req.json()
  const{error}=await resend.emails.send({
    from:`${kongress_name} <anmeldung@sportmedizin-arlberg.at>`,
    to:email,bcc:'info@sportmedizin-arlberg.at',
    subject:`Rechnung ${rechnungsnummer} - ${kongress_name}`,
    html:`<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <p style="font-size:15px;margin:0 0 12px">Sehr geehrte Damen und Herren,</p>
      <p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 16px">anbei erhalten Sie Ihre Rechnung <strong>${rechnungsnummer}</strong>.<br>Bitte öffnen Sie den Anhang oder drucken Sie die Rechnung über den Admin-Bereich.</p>
      <p style="font-size:13px;color:#555">Mit sportlichen Grüßen<br><strong>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</strong><br>Kongresspräsident</p>
    </div>`,
  })
  if(error){console.error(error);return NextResponse.json({error},{status:500})}
  return NextResponse.json({ok:true})
}

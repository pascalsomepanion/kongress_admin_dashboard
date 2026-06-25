import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    const kurse=(body.kurs_titel as string[]).join(', ')
    const subject='Anmeldebestaetigung '+body.kongress_name
    await resend.emails.send({
      from:'anmeldung@sportmedizin-arlberg.at',
      to:body.email,
      bcc:body.kontakt_email,
      subject:subject,
      html:'<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px">'
        +'<h2 style="color:#111">Anmeldebestaetigung</h2>'
        +'<p>Sehr geehrte/r '+body.vorname+' '+body.nachname+',</p>'
        +'<p>vielen Dank fuer Ihre Anmeldung zum '+body.kongress_name+'.</p>'
        +'<p><strong>Gebuchte Kurse:</strong> '+kurse+'</p>'
        +'<div style="background:#FFF9E6;border:1px solid #FFE082;padding:16px;border-radius:8px;margin:16px 0">'
        +'<p><strong>Betrag: EUR '+body.gesamtbetrag.toFixed(2)+'</strong></p>'
        +'<p>IBAN: '+body.iban+'</p>'
        +'<p>BIC: '+body.bic+'</p>'
        +'<p>Kontoinhaber: '+body.kontoinhaber+'</p>'
        +'<p>Verwendungszweck: '+body.vorname+' '+body.nachname+'</p>'
        +'</div>'
        +'<p>Bei Fragen: '+body.kontakt_email+'</p>'
        +'</div>',
    })
    return NextResponse.json({ok:true})
  }catch(e){
    return NextResponse.json({error:String(e)},{status:500})
  }
}

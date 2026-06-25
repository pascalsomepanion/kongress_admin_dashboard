import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    const{email,vorname,nachname,rechnungsnummer,kongress_name,html}=body
    await resend.emails.send({
      from:'info@sportmedizin-arlberg.at',
      to:email,
      bcc:'info@sportmedizin-arlberg.at',
      subject:'Rechnung '+rechnungsnummer+' - '+kongress_name,
      html: html || `<p>Sehr geehrte Damen und Herren,<br><br>anbei erhalten Sie Ihre Rechnung ${rechnungsnummer}.<br><br>Mit sportlichen Grüßen<br>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p>`,
    })
    return NextResponse.json({ok:true})
  }catch(e){
    console.error(e)
    return NextResponse.json({error:String(e)},{status:500})
  }
}

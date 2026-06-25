import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const body=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    const subject='Rechnung '+body.rechnungsnummer+' '+body.kongress_name
    await resend.emails.send({
      from:'info@sportmedizin-arlberg.at',
      to:body.email,
      bcc:'info@sportmedizin-arlberg.at',
      subject:subject,
      html:'<p>Sehr geehrte Damen und Herren, anbei Ihre Rechnung '+body.rechnungsnummer+'</p>',
    })
    return NextResponse.json({ok:true})
  }catch(e){
    return NextResponse.json({error:String(e)},{status:500})
  }
}

import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const{email,vorname,nachname,html,kongress_name,kongress_jahr}=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({
      from:'info@sportmedizin-arlberg.at',
      to:email,
      subject:`Teilnahmebestätigung — ${kongress_name} ${kongress_jahr}`,
      html:`<p>Sehr geehrte/r ${vorname} ${nachname},</p><p>anbei Ihre Teilnahmebestätigung für den ${kongress_name} ${kongress_jahr}.</p><p>Mit sportlichen Grüßen<br>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</p>`,
      attachments:[{filename:`Teilnahmebestaetigung_${nachname}_${vorname}.html`,content:Buffer.from(html).toString('base64'),content_type:'text/html'}]
    })
    return NextResponse.json({ok:true})
  }catch(e){
    return NextResponse.json({error:String(e)},{status:500})
  }
}

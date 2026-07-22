import{NextRequest,NextResponse}from'next/server'
export async function POST(req:NextRequest){
  try{
    const{betreff,text,empfaenger,kongress_name,kongress_jahr}=await req.json()
    const{Resend}=await import('resend')
    const resend=new Resend(process.env.RESEND_API_KEY)
    let sent=0
    for(const e of empfaenger as {vorname:string;nachname:string;email:string}[]){
      const html=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:13px;color:#111;max-width:600px;margin:0 auto;padding:20px;line-height:1.7">
<div style="background:#FFBF00;padding:16px 24px;border-radius:8px 8px 0 0">
  <h1 style="font-size:16px;font-weight:800;color:#111;margin:0">${betreff}</h1>
  <p style="font-size:11px;color:rgba(0,0,0,.5);margin:4px 0 0">${kongress_name} ${kongress_jahr}</p>
</div>
<div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px">
  <p>Sehr geehrte/r ${e.vorname} ${e.nachname},</p><br>
  ${text.replace(/\n/g,'<br>')}
  <p style="margin-top:24px;color:#6b7280;font-size:12px">Mit sportlichen Grüßen<br><strong>Prof. h.c. Univ.-Doz. Dr. Günther Neumayr</strong><br>Kongresspräsident</p>
</div></body></html>`
      await resend.emails.send({from:'info@sportmedizin-arlberg.at',to:e.email,subject:betreff,html})
      sent++
      // Small delay to avoid rate limiting
      await new Promise(r=>setTimeout(r,100))
    }
    return NextResponse.json({ok:true,sent})
  }catch(e){
    return NextResponse.json({error:String(e)},{status:500})
  }
}

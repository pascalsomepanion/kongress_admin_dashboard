'use client'
import{useEffect,useState}from'react'
import{useRouter,usePathname}from'next/navigation'
import Link from'next/link'
import{supabase}from'@/lib/db'

const NAV=[
  {href:'/admin',label:'Dashboard',icon:'◈'},
  {href:'/admin/teilnehmer',label:'Teilnehmer',icon:'◉'},
  {href:'/admin/buchungen',label:'Zahlungen',icon:'◎'},
  {href:'/admin/rechnungen',label:'Rechnungen',icon:'◻'},
  {href:'/admin/sponsoren',label:'Sponsoren',icon:'◆'},
  {href:'/admin/kurse',label:'Kurse',icon:'◐'},
  {href:'/admin/anwesenheit',label:'Anwesenheit',icon:'◑'},
  {href:'/admin/kongress',label:'Kongress',icon:'◇'},
  {href:'/admin/export',label:'Export',icon:'↓'},
]

export default function AdminLayout({children}:{children:React.ReactNode}){
  const router=useRouter(),pathname=usePathname()
  const[ok,setOk]=useState(false),[email,setEmail]=useState('')
  useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(!data.session){router.push('/login');return};setEmail(data.session.user.email??'');setOk(true)})},[router])
  if(!ok)return(
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{textAlign:'center'}}>
        <div style={{width:32,height:32,border:'2px solid rgba(255,200,3,0.15)',borderTop:'2px solid var(--primary)',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 12px'}}/>
        <p style={{color:'rgba(255,255,255,0.3)',fontSize:12,letterSpacing:'0.15em'}}>Laden…</p>
      </div>
    </div>
  )
  return(
    <div style={{minHeight:'100vh',background:'#f0efe9',display:'flex'}}>
      {/* SIDEBAR */}
      <aside style={{
        width:220,background:'var(--navy)',display:'flex',flexDirection:'column',
        flexShrink:0,position:'fixed',height:'100%',zIndex:20,
        borderRight:'1px solid rgba(255,200,3,0.08)',
      }}>
        {/* Logo */}
        <div style={{padding:'24px 20px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:4}}>
            <div style={{
              width:34,height:34,background:'var(--primary)',borderRadius:10,
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:13,fontWeight:900,color:'var(--navy)',letterSpacing:'-0.05em',flexShrink:0,
            }}>SM</div>
            <div>
              <p style={{fontSize:9,fontWeight:700,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,255,255,0.3)',lineHeight:1}}>Admin</p>
              <p style={{fontSize:12,fontWeight:700,color:'var(--white)',lineHeight:1.3,marginTop:3}}>Sportmedizin Kongress</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:'12px 10px',overflowY:'auto'}}>
          {NAV.map(n=>{
            const active=pathname===n.href||(n.href!=='/admin'&&pathname.startsWith(n.href))
            return(
              <Link key={n.href} href={n.href} style={{
                display:'flex',alignItems:'center',gap:10,
                padding:'9px 12px',borderRadius:10,marginBottom:2,
                fontSize:13,fontWeight: active ? 600 : 400,
                color: active ? 'var(--navy)' : 'rgba(255,255,255,0.45)',
                background: active ? 'var(--primary)' : 'transparent',
                transition:'var(--transition)',letterSpacing:'0.01em',
              }}>
                <span style={{fontSize:14,opacity: active ? 1 : 0.6}}>{n.icon}</span>
                {n.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{padding:'14px 16px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <p style={{fontSize:10,color:'rgba(255,255,255,0.25)',marginBottom:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{email}</p>
          <button onClick={async()=>{await supabase.auth.signOut();router.push('/login')}} style={{
            width:'100%',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',
            borderRadius:8,padding:'7px 12px',fontSize:11,color:'rgba(255,255,255,0.35)',
            cursor:'pointer',textAlign:'left',fontFamily:'var(--font)',letterSpacing:'0.05em',
            transition:'var(--transition)',
          }}>
            Abmelden →
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{flex:1,marginLeft:220,minHeight:'100vh'}}>
        {children}
      </main>
    </div>
  )
}

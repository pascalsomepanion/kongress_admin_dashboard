'use client'
import{useState}from'react'
import{useRouter}from'next/navigation'
import{supabase}from'@/lib/db'

export default function LoginPage(){
  const router=useRouter()
  const[email,setEmail]=useState('')
  const[password,setPassword]=useState('')
  const[error,setError]=useState('')
  const[loading,setLoading]=useState(false)

  async function login(){
    if(!email||!password)return
    setLoading(true);setError('')
    const{error:e}=await supabase.auth.signInWithPassword({email,password})
    if(e){setError('E-Mail oder Passwort ungültig');setLoading(false);return}
    router.push('/admin')
  }

  return(
    <div style={{minHeight:'100vh',background:'var(--navy)',display:'flex',alignItems:'center',justifyContent:'center',padding:24,position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 0%, rgba(255,200,3,0.07) 0%, transparent 60%)'}}/>
      <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:1}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{
            width:52,height:52,background:'var(--primary)',borderRadius:16,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:18,fontWeight:900,color:'var(--navy)',margin:'0 auto 16px',
            boxShadow:'0 8px 32px rgba(255,200,3,0.3)',
          }}>SM</div>
          <p style={{fontSize:11,fontWeight:600,letterSpacing:'0.2em',textTransform:'uppercase',color:'rgba(255,255,255,0.3)',marginBottom:6}}>Admin</p>
          <h1 style={{fontSize:20,fontWeight:700,color:'var(--white)'}}>Kongress Sportmedizin</h1>
        </div>

        {/* Form */}
        <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'var(--radius-xl)',padding:'32px 28px',backdropFilter:'blur(10px)'}}>
          {error&&<div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:'var(--radius)',padding:'12px 14px',fontSize:13,color:'#fca5a5',marginBottom:20}}>{error}</div>}
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.4)',marginBottom:7,letterSpacing:'0.08em'}}>E-Mail</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} style={{
              width:'100%',background:'rgba(255,255,255,0.06)',border:'1.5px solid rgba(255,255,255,0.1)',
              borderRadius:'var(--radius)',padding:'11px 14px',fontSize:14,color:'var(--white)',
              outline:'none',fontFamily:'var(--font)',
            }}/>
          </div>
          <div style={{marginBottom:24}}>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.4)',marginBottom:7,letterSpacing:'0.08em'}}>Passwort</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} style={{
              width:'100%',background:'rgba(255,255,255,0.06)',border:'1.5px solid rgba(255,255,255,0.1)',
              borderRadius:'var(--radius)',padding:'11px 14px',fontSize:14,color:'var(--white)',
              outline:'none',fontFamily:'var(--font)',
            }}/>
          </div>
          <button onClick={login} disabled={loading||!email||!password} style={{
            width:'100%',background:'var(--primary)',border:'none',color:'var(--navy)',
            fontFamily:'var(--font)',fontWeight:700,fontSize:14,letterSpacing:'0.05em',
            padding:'14px',borderRadius:'var(--radius-lg)',cursor:'pointer',
            opacity: loading||!email||!password ? 0.6 : 1,
            boxShadow:'0 4px 20px rgba(255,200,3,0.25)',transition:'var(--transition)',
          }}>
            {loading ? 'Anmelden…' : 'Anmelden'}
          </button>
        </div>
      </div>
    </div>
  )
}

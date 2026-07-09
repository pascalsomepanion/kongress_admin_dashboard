import React from 'react'

export function Btn({onClick,children,variant='primary',size='md',disabled,className}:{onClick?:()=>void;children:React.ReactNode;variant?:'primary'|'outline'|'danger'|'ghost';size?:'sm'|'md';disabled?:boolean;className?:string}){
  const base:React.CSSProperties={
    display:'inline-flex',alignItems:'center',gap:6,
    fontFamily:'var(--font)',fontWeight:600,cursor:disabled?'not-allowed':'pointer',
    borderRadius:10,border:'none',transition:'var(--transition)',
    opacity:disabled?0.5:1,letterSpacing:'0.02em',
    padding: size==='sm' ? '6px 12px' : '10px 18px',
    fontSize: size==='sm' ? 12 : 13,
  }
  const styles:Record<string,React.CSSProperties>={
    primary:{...base,background:'var(--primary)',color:'var(--navy)',border:'none'},
    outline:{...base,background:'transparent',color:'var(--navy)',border:'1.5px solid rgba(10,22,40,0.12)'},
    danger:{...base,background:'rgba(239,68,68,0.08)',color:'#dc2626',border:'1px solid rgba(239,68,68,0.2)'},
    ghost:{...base,background:'transparent',color:'var(--text-muted)',border:'none'},
  }
  return <button style={styles[variant]} onClick={onClick} disabled={disabled} className={className}>{children}</button>
}

export function Badge({label,variant='gray'}:{label:string;variant?:'green'|'yellow'|'red'|'blue'|'gray'}){
  const colors:Record<string,React.CSSProperties>={
    green:{background:'rgba(34,197,94,0.08)',color:'#16a34a',border:'1px solid rgba(34,197,94,0.2)'},
    yellow:{background:'rgba(255,200,3,0.1)',color:'#92650a',border:'1px solid rgba(255,200,3,0.25)'},
    red:{background:'rgba(239,68,68,0.08)',color:'#dc2626',border:'1px solid rgba(239,68,68,0.2)'},
    blue:{background:'rgba(59,130,246,0.08)',color:'#1d4ed8',border:'1px solid rgba(59,130,246,0.2)'},
    gray:{background:'rgba(10,22,40,0.05)',color:'var(--text-muted)',border:'1px solid rgba(10,22,40,0.08)'},
  }
  return <span style={{...colors[variant],fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:100,whiteSpace:'nowrap',letterSpacing:'0.04em'}}>{label}</span>
}

export function Loader(){
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'48px 0'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{width:28,height:28,border:'2.5px solid rgba(10,22,40,0.08)',borderTop:'2.5px solid var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    </div>
  )
}

export function Modal({title,onClose,children,wide,scroll}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean;scroll?:boolean}){
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(10,22,40,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:16,backdropFilter:'blur(4px)'}}>
      <div style={{
        background:'var(--white)',borderRadius:'var(--radius-xl)',boxShadow:'var(--shadow-lg)',
        width:'100%',maxWidth: wide ? 900 : 520,
        display:'flex',flexDirection:'column',
        ...(scroll ? {maxHeight:'90vh'} : {}),
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'20px 24px',borderBottom:'1px solid var(--border-light)',flexShrink:0}}>
          <h2 style={{fontSize:15,fontWeight:700,color:'var(--navy)'}}>{title}</h2>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,color:'var(--text-muted)',cursor:'pointer',lineHeight:1,padding:'2px 6px',borderRadius:6}}>×</button>
        </div>
        <div style={{padding:'20px 24px',...(scroll?{overflowY:'auto'}:{})}}>{children}</div>
      </div>
    </div>
  )
}

export function Field({label,id,value,onChange,span2,type='text'}:{label:string;id:string;value:string;onChange:(v:string)=>void;span2?:boolean;type?:string}){
  return(
    <div style={span2?{gridColumn:'span 2'}:{}}>
      <label htmlFor={id} style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-muted)',marginBottom:6,letterSpacing:'0.04em'}}>{label}</label>
      <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} style={{
        width:'100%',background:'rgba(10,22,40,0.02)',border:'1.5px solid rgba(10,22,40,0.1)',
        borderRadius:'var(--radius)',padding:'9px 12px',fontSize:13,color:'var(--navy)',
        outline:'none',fontFamily:'var(--font)',transition:'var(--transition)',
      }}
      onFocus={e=>{e.target.style.borderColor='var(--primary)';e.target.style.background='var(--white)'}}
      onBlur={e=>{e.target.style.borderColor='rgba(10,22,40,0.1)';e.target.style.background='rgba(10,22,40,0.02)'}}
      />
    </div>
  )
}

export function PageHeader({title,sub,children}:{title:string;sub?:string;children?:React.ReactNode}){
  return(
    <div style={{
      background:'var(--white)',borderBottom:'1px solid var(--border-light)',
      padding:'20px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',
      gap:16,position:'sticky',top:0,zIndex:10,
      boxShadow:'0 1px 0 rgba(10,22,40,0.04)',
    }}>
      <div>
        <h1 style={{fontSize:16,fontWeight:700,color:'var(--navy)',letterSpacing:'-0.01em'}}>{title}</h1>
        {sub&&<p style={{fontSize:12,color:'var(--text-muted)',marginTop:2}}>{sub}</p>}
      </div>
      {children&&<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}}>{children}</div>}
    </div>
  )
}

export function Table({headers,children,empty}:{headers:string[];children?:React.ReactNode;empty?:boolean}){
  return(
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead>
          <tr style={{borderBottom:'1px solid var(--border-light)',background:'rgba(10,22,40,0.02)'}}>
            {headers.map(h=><th key={h} style={{padding:'10px 16px',textAlign:'left',fontSize:10,fontWeight:700,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--text-muted)'}}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {empty
            ?<tr><td colSpan={headers.length} style={{padding:'48px 16px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Keine Einträge vorhanden</td></tr>
            :children
          }
        </tbody>
      </table>
    </div>
  )
}

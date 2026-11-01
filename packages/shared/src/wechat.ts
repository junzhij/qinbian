import { parseFragment, serialize } from 'parse5'

// The editor may keep rich HTML, but clipboard HTML uses WeChat's block vocabulary.
export function wechatHtml(safeHtml:string){
 const root:any=parseFragment(safeHtml)
 const inherited=['color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-indent','white-space','text-decoration']
 const visit=(n:any,parent:Record<string,string>={})=>{
  if(!n.tagName){for(const c of n.childNodes||[])visit(c,parent);return}
  const oldTag=n.tagName,style=(n.attrs||[]).find((a:any)=>a.name==='style'),css:Record<string,string>={}
  for(const s of (style?.value||'').split(';')){const at=s.indexOf(':');if(at>0)css[s.slice(0,at).trim()]=s.slice(at+1).trim()}
  if(['div','figure'].includes(oldTag))n.tagName=n.nodeName='section'
  if(['figcaption','h2','h3','h4','pre'].includes(oldTag))n.tagName=n.nodeName='p'
  if(/^h[234]$/.test(oldTag)){css['font-size']||=oldTag==='h2'?'22px':oldTag==='h3'?'19px':'17px';css['font-weight']||='600';css.margin||='0 0 12px'}
  if(css['font-family']?.trim().toLowerCase()==='inherit')delete css['font-family']
  if(oldTag==='img')for(const key of ['object-fit','object-position','aspect-ratio'])delete css[key]
  if(oldTag==='pre')css['white-space']||='pre-wrap'
  if(['strong','b'].includes(oldTag))css['font-weight']||='700'
  if(['em','i'].includes(oldTag))css['font-style']||='italic'
  const effective={...parent,...Object.fromEntries(inherited.filter(k=>css[k]).map(k=>[k,css[k]!]))}
  if(['span','p','a','td','th'].includes(n.tagName))for(const [k,v]of Object.entries(effective))css[k]||=v
  if(n.tagName==='span')delete css['text-indent']
  n.attrs=(n.attrs||[]).filter((a:any)=>a.name!=='style')
  if(Object.keys(css).length)n.attrs.push({name:'style',value:Object.entries(css).map(([k,v])=>`${k}:${v};`).join('')})
  for(const c of n.childNodes||[])visit(c,effective)
 }
 visit(root,{'font-size':'15px','line-height':'1.85',color:'#293F4F','white-space':'normal'})
 return serialize(root)
}

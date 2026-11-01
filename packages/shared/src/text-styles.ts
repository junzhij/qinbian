import { z } from 'zod'
import { wechatFontStack } from './typography.ts'
import { parseHtml, serializeHtml, attr, setAttr, removeAttr, elements, textOf, styleMap, writeStyles, walkHtml } from './html-tree.ts'
export const textRoles=['body','heading','subheading','caption','quote'] as const
export type TextRole=typeof textRoles[number]
export const roleLabels:Record<TextRole|'none',string>={body:'正文',heading:'大标题',subheading:'小标题',caption:'图注与署名',quote:'引文',none:'保留原设计'}
export const roleSchema=z.enum([...textRoles,'none'])
export const typefaceStyles={inherit:'inherit',songti:'Songti SC,STSong,SimSun,serif',heiti:'PingFang SC,Microsoft YaHei,sans-serif',kaiti:'STKaiti,KaiTi,serif'}
export const textRuleSchema=z.object({fontSize:z.number().min(10).max(24),lineHeight:z.number().min(1).max(3),align:z.enum(['left','center','right','justify']),indent:z.number().min(0).max(4),before:z.number().min(0).max(64),after:z.number().min(0).max(64),letterSpacing:z.number().min(0).max(6),weight:z.enum(['400','500','600','700']),font:z.enum(['inherit','songti','heiti','kaiti']),color:z.string().regex(/^#[\da-fA-F]{6}$/).nullable()})
export type TextRule=z.infer<typeof textRuleSchema>
const rule=(fontSize:number,align:TextRule['align'],before:number,after:number,weight:TextRule['weight']='400',indent=0):TextRule=>({fontSize,lineHeight:1.85,align,indent,before,after,letterSpacing:0,weight,font:'inherit',color:null})
export const defaultTextStyles={enabled:true,preserveOverrides:true,roles:{body:rule(15,'justify',0,12,'400',2),heading:{...rule(22,'left',20,12,'600'),lineHeight:1.5},subheading:{...rule(18,'left',16,10,'600'),lineHeight:1.6},caption:rule(12,'center',8,8),quote:rule(15,'justify',12,12)}}
export const articleTextStylesSchema=z.object({enabled:z.boolean().default(true),preserveOverrides:z.boolean().default(true),roles:z.object({body:textRuleSchema,heading:textRuleSchema,subheading:textRuleSchema,caption:textRuleSchema,quote:textRuleSchema})})
export type ArticleTextStyles=z.infer<typeof articleTextStylesSchema>
export function normalizeTextStyles(value?:unknown){const p=articleTextStylesSchema.safeParse(value);return p.success?p.data:structuredClone(defaultTextStyles)}
export const typographyProperties=['font-size','font-family','font-weight','line-height','letter-spacing','text-align','text-indent','margin-top','margin-bottom','color'] as const
const typeKeys=new Set<string>(typographyProperties)
export function cleanTextBackup(raw:string){try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return{};return Object.fromEntries(Object.entries(value).filter(([k,v])=>typeKeys.has(k)&&(v===null||typeof v==='string'&&v.length<=512&&!/[;<>\\{}]/.test(v)&&!/url\s*\(|expression|javascript|var\s*\(/i.test(v)))) as Record<string,string|null>}catch{return{}}}
const customKeys=(n:any)=>new Set([...(attr(n,'data-qb-custom-properties')||'').split(','),...(attr(n,'data-qb-text-overrides')||'').split(',')].filter(Boolean))
const isCustom=(n:any,k:string,preserve:boolean)=>preserve&&(customKeys(n).has(k)||k==='color'&&attr(n,'data-qb-custom-color')==='true')
export function restoreTextStyles(html:string,preserveOverrides=true){
 const root=parseHtml(html)
 walkHtml(root,n=>{const backup=cleanTextBackup(attr(n,'data-qb-typography')||''),css=styleMap(attr(n,'style')||'');for(const[k,v]of Object.entries(backup)){if(isCustom(n,k,preserveOverrides))continue;if(v===null)delete css[k];else css[k]=v}removeAttr(n,'data-qb-typography');writeStyles(n,css)})
 return serializeHtml(root)
}
export function freezeTextNode(n:any){
 walkHtml(n,c=>{const keys=Object.keys(cleanTextBackup(attr(c,'data-qb-typography')||''));if(keys.length){const custom=customKeys(c);keys.forEach(k=>custom.add(k));setAttr(c,'data-qb-custom-properties',[...custom].join(','));try{const bindings=JSON.parse(attr(c,'data-qb-styles')||'{}');for(const k of keys)delete bindings[k];if(Object.keys(bindings).length)setAttr(c,'data-qb-styles',JSON.stringify(bindings));else removeAttr(c,'data-qb-styles')}catch{}}removeAttr(c,'data-qb-typography')})
}
export function freezeTextStyles(html:string){const root=parseHtml(html);freezeTextNode(root);return serializeHtml(root)}
function hint(n:any){return(attr(n,'data-qb-field')||'')+' '+elements(n).map(c=>attr(c,'data-qb-field')||'').join(' ')}
export function inferTextRole(n:any):TextRole|'none'{
 const declared=roleSchema.safeParse(attr(n,'data-qb-role'));if(declared.success)return declared.data
 if(!['p','h2','h3','h4','figcaption','div','section'].includes(n.tagName))return 'none'
 if(['div','section'].includes(n.tagName)&&elements(n).some(c=>['p','div','section','img','figure','table','ul','ol'].includes(c.tagName)))return 'none'
 const text=textOf(n).trim(),id=hint(n).toLowerCase(),css=styleMap(attr(n,'style')||''),size=parseFloat(css['font-size']||'15')
 if(!text||/^[\d\s,.%％+—–\-/：:]+$/.test(text))return 'none'
 if(n.tagName==='figcaption'||/(?:caption|credit|signature|author|source|footer|图注|署名)/.test(id)||/^(?:文[字案]?|摄[影像]|图[片]?|编辑|校对|审核|来源|数据来源)\s*[：:｜|／/]/.test(text))return 'caption'
 if(/quote|引文|引用/.test(id))return 'quote'
 if(/subtitle|subheading/.test(id))return 'subheading'
 if(/(?:^|\W|_)(?:title|heading|headline)(?:$|\W|_)/.test(id))return 'heading'
 if(/body|content|paragraph|intro|description|summary|bio|正文|简介|说明/.test(id))return 'body'
 if(n.tagName==='h2'||size>=21&&text.length<100)return 'heading'
 if(['h3','h4'].includes(n.tagName)||size>=17&&text.length<100||/subtitle|subheading/.test(id))return 'subheading'
 if(/(?:^|\W|_)(?:title|heading|headline)(?:$|\W|_)/.test(id))return 'heading'
 if(/body|content|paragraph|intro|description|summary|bio|正文|简介|说明/.test(id)||text.length>=40)return 'body'
 if(size<=13&&text.length<=120)return 'caption'
 return 'none'
}
function markOriginal(n:any,k:string,value:string|undefined){const backup=cleanTextBackup(attr(n,'data-qb-typography')||'');if(!Object.hasOwn(backup,k))backup[k]=value??null;setAttr(n,'data-qb-typography',JSON.stringify(backup))}
function setManaged(n:any,k:string,value:string|undefined,preserve:boolean){if(isCustom(n,k,preserve))return;if(!preserve){for(const name of ['data-qb-custom-properties','data-qb-text-overrides']){const keys=(attr(n,name)||'').split(',').filter(key=>key&&key!==k);if(keys.length)setAttr(n,name,keys.join(','));else removeAttr(n,name)}if(k==='color')removeAttr(n,'data-qb-custom-color')}const css=styleMap(attr(n,'style')||'');if(css[k]===value)return;markOriginal(n,k,css[k]);if(value===undefined)delete css[k];else css[k]=value;writeStyles(n,css)}
function clearInline(n:any,role:TextRole,profile:ArticleTextStyles){
 for(const child of elements(n)){
  if(attr(child,'data-qb-style-mode')==='independent'||attr(child,'data-qb-chart'))continue
  if(!['span','strong','b','em','i','a','u','s','br'].includes(child.tagName))continue
  const css=styleMap(attr(child,'style')||'')
  for(const k of ['font-size','font-family','line-height','letter-spacing'])if(css[k]!==undefined)setManaged(child,k,undefined,profile.preserveOverrides)
  if(css['font-weight']!==undefined&&(!['body','quote'].includes(role)||Number(css['font-weight'])<600))setManaged(child,'font-weight',undefined,profile.preserveOverrides)
  if(profile.roles[role].color&&css.color!==undefined)setManaged(child,'color',undefined,profile.preserveOverrides)
  clearInline(child,role,profile)
 }
}
export interface TextStyleSummary {body:number;heading:number;subheading:number;caption:number;quote:number;independent:number;unclassified:number}
export function applyTextStyles(html:string,profile?:ArticleTextStyles){
 const root=parseHtml(html),summary:TextStyleSummary={body:0,heading:0,subheading:0,caption:0,quote:0,independent:0,unclassified:0}
 const visit=(n:any,protectedArea=false,ancestorFont='')=>{
  if(attr(n,'data-qb-style-mode')==='independent'){summary.independent++;return}
  if(attr(n,'data-qb-chart')||['pre','code','svg'].includes(n.tagName))return
  const role=protectedArea&&!attr(n,'data-qb-role')?'none':inferTextRole(n)
  if(role!=='none'){
   summary[role]++;if(profile?.enabled){setAttr(n,'data-qb-role',role);const r=profile.roles[role];setManaged(n,'font-size',r.fontSize+'px',profile.preserveOverrides);setManaged(n,'font-family',r.font==='inherit'?(ancestorFont?wechatFontStack:undefined):typefaceStyles[r.font],profile.preserveOverrides);setManaged(n,'line-height',String(r.lineHeight),profile.preserveOverrides);setManaged(n,'font-weight',r.weight,profile.preserveOverrides);setManaged(n,'text-align',r.align,profile.preserveOverrides);setManaged(n,'text-indent',r.indent+'em',profile.preserveOverrides);setManaged(n,'margin-top',r.before+'px',profile.preserveOverrides);setManaged(n,'margin-bottom',r.after+'px',profile.preserveOverrides);setManaged(n,'letter-spacing',r.letterSpacing+'px',profile.preserveOverrides);if(r.color)setManaged(n,'color',r.color,profile.preserveOverrides);clearInline(n,role,profile)}
   // Inline descendants belong to this paragraph, not another role.
   for(const child of elements(n))if(!['span','strong','b','em','i','a','u','s','br'].includes(child.tagName))visit(child,protectedArea,styleMap(attr(n,'style')||'')['font-family']||ancestorFont)
   return
  }
  if(['p','h2','h3','h4','figcaption'].includes(n.tagName)&&textOf(n).trim())summary.unclassified++
  for(const child of elements(n))visit(child,protectedArea||['table','thead','tbody','tr','td','th'].includes(n.tagName),styleMap(attr(n,'style')||'')['font-family']||ancestorFont)
 }
 for(const child of elements(root))visit(child)
 return{html:serializeHtml(root),summary}
}

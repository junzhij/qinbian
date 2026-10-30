import { parseFragment, serialize } from 'parse5'
import { z } from 'zod'
import { chartSchema, chartReferences, bindChartNode, chartColorTokens } from './charts.ts'
import { imageSpecSchema, inferImageSpec, fillImageNode } from './images.ts'

export const tones=['regular','highlight','light'] as const
export const toneLabels={regular:'主题色',highlight:'强调色',light:'减淡色'}
const hex=z.string().regex(/^#[0-9a-fA-F]{6}$/)
export const paletteColorSchema=z.object({id:z.string().regex(/^color[1-6]$/),name:z.string().trim().min(1).max(40),regular:hex,highlight:hex,light:hex})
export const paletteSchema=z.object({name:z.string().max(100).default('自定义配色'),colors:z.array(paletteColorSchema).min(3).max(6)}).refine(p=>new Set(p.colors.map(c=>c.id)).size===p.colors.length,'颜色代号不能重复')
export type Palette=z.infer<typeof paletteSchema>
export type PaletteColor=z.infer<typeof paletteColorSchema>
export const fieldSchema=z.object({id:z.string().regex(/^[a-zA-Z][\w.-]{0,63}$/),label:z.string().max(80),type:z.enum(['text','number','image','computed']).default('text'),default:z.union([z.string().max(10000),z.number()]).default(''),min:z.number().optional(),max:z.number().optional(),step:z.number().positive().optional(),suffix:z.string().max(20).default(''),image:imageSpecSchema.optional(),formula:z.object({op:z.literal('percent'),numerator:z.string(),denominator:z.string()}).optional()})
export type FieldDefinition=z.infer<typeof fieldSchema>
export const componentSettingsSchema=z.object({palette:paletteSchema.optional(),fields:z.array(fieldSchema).max(40).default([]),values:z.record(z.string(),z.union([z.string(),z.number()])).default({}),colorMappings:z.record(z.string(),z.string()).default({})})
export type ComponentSettings=z.infer<typeof componentSettingsSchema>
export function normalizeHex(value:string):string|null {
 let s=value.trim().toLowerCase()
 if(/^#[0-9a-f]{3}$/.test(s))s='#'+s.slice(1).split('').map(x=>x+x).join('')
 if(/^#[0-9a-f]{6}$/.test(s))return s
 const rgb=s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*1)?\s*\)$/)
 return rgb?'#'+rgb.slice(1,4).map(v=>Math.min(255,Number(v)).toString(16).padStart(2,'0')).join(''):null
}
function mix(color:string,target:number,amount:number){const s=normalizeHex(color)||'#183a49';return '#'+[1,3,5].map(i=>Math.round(parseInt(s.slice(i,i+2),16)*(1-amount)+target*amount).toString(16).padStart(2,'0')).join('')}
export function makeColor(id:string,name:string,regular:string):PaletteColor {const base=normalizeHex(regular)||'#183a49';return{id,name,regular:base,highlight:mix(base,0,.18),light:mix(base,255,.88)}}
export const defaultPalette:Palette={name:'青衿纸墨',colors:[makeColor('color1','墨蓝','#183A49'),makeColor('color2','灰青','#567067'),makeColor('color3','朱砂','#9E4B3B'),makeColor('color4','纸白','#FFFCF6')]}
export function normalizePalette(value?:unknown,legacy?:Record<string,string>):Palette {
 const parsed=paletteSchema.safeParse(value);if(parsed.success)return parsed.data
 const entries=Object.entries(legacy||{}).filter(([,v])=>!!normalizeHex(v)).slice(0,6)
 if(entries.length){while(entries.length<3)entries.push([defaultPalette.colors[entries.length]!.name,defaultPalette.colors[entries.length]!.regular]);return{name:'主题配色',colors:entries.map(([name,color],i)=>makeColor(`color${i+1}`,name,color))}}
 return structuredClone(defaultPalette)
}
export function legacyTokens(palette:Palette){return Object.fromEntries(palette.colors.map((c,i)=>[palette.colors.some((x,j)=>x.name===c.name&&j!==i)?`${c.name} ${c.id}`:c.name,c.regular]))}
export function paletteEntries(palette:Palette){return palette.colors.flatMap(c=>tones.map(t=>({token:`${c.id}-${t}`,name:c.name,tone:t,label:`${c.name} · ${toneLabels[t]}`,value:c[t]})))}
export function resolveColor(token:string,palette:Palette,mappings:Record<string,string>={}):string {
 let current=token;const seen=new Set<string>()
 for(let n=0;n<8;n++){const mapped=mappings[current];if(!mapped||seen.has(current))break;seen.add(current);if(normalizeHex(mapped))return normalizeHex(mapped)!;current=mapped}
 return paletteEntries(palette).find(c=>c.token===current)?.value||paletteEntries(palette).find(c=>c.token===token)?.value||palette.colors[0]!.regular
}
const tokenPattern=/\{\{\s*([a-zA-Z][\w.-]{0,63})\s*\}\}/g
const colorToken=/^color[1-6]-(?:regular|highlight|light)$/
const attr=(n:any,name:string)=>(n?.attrs||[]).find((a:any)=>a.name===name)?.value as string|undefined
const setAttr=(n:any,name:string,value:string)=>{n.attrs=n.attrs||[];const a=n.attrs.find((a:any)=>a.name===name);if(a)a.value=value;else n.attrs.push({name,value})}
const text=(n:any):string=>n.nodeName==='#text'?n.value:n.tagName==='br'?'\n':(n.childNodes||[]).map(text).join('')
const walk=(n:any,fn:(node:any)=>void)=>{fn(n);for(const c of [...(n.childNodes||[])])walk(c,fn)}
const jsonMap=(value?:string):Record<string,string>=>{try{const p=JSON.parse(value||'{}');return p&&typeof p==='object'&&!Array.isArray(p)?Object.fromEntries(Object.entries(p).filter(([k,v])=>/^[a-z-]+$/.test(k)&&typeof v==='string').map(([k,v])=>[k,v as string])):{}}catch{return{}}}
function declarations(css:string){const result:[string,string][]=[];let buffer='',quote='',depth=0;for(const c of css+';'){if(quote){buffer+=c;if(c===quote)quote='';continue}if(c==='"'||c==="'"){quote=c;buffer+=c;continue}if(c==='(')depth++;if(c===')')depth--;if(c===';'&&!depth){const i=buffer.indexOf(':');if(i>0)result.push([buffer.slice(0,i).trim().toLowerCase(),buffer.slice(i+1).trim()]);buffer=''}else buffer+=c}return result}
function node(tag:string,attrs:Record<string,string>,children:any[]=[]){const n:any={nodeName:tag,tagName:tag,namespaceURI:'http://www.w3.org/1999/xhtml',attrs:Object.entries(attrs).map(([name,value])=>({name,value})),childNodes:children};for(const c of children)c.parentNode=n;return n}
const textNode=(value:string)=>({nodeName:'#text',value})
function evaluateFields(fields:FieldDefinition[],values:Record<string,string|number>){const result:Record<string,string|number>={};for(const f of fields)result[f.id]=values[f.id]??f.default;for(let pass=0;pass<3;pass++)for(const f of fields)if(f.type==='computed'&&f.formula){const a=Number(result[f.formula.numerator]),b=Number(result[f.formula.denominator]);result[f.id]=Number.isFinite(a)&&Number.isFinite(b)&&b>0?Math.round(a/b*1000)/10:0}return result}
export function extractFieldValues(html:string,fields:FieldDefinition[]){const root:any=parseFragment(html),values:Record<string,string|number>={};walk(root,n=>{const key=attr(n,'data-qb-field');if(!key)return;const field=fields.find(f=>f.id===key);if(!field||field.type==='computed')return;if(field.type==='image'){let image:any;walk(n,c=>{if(c.tagName==='img')image=c});values[key]=image?attr(image,'src')||'':''}else{const value=text(n);if(value.includes('{{'))return;values[key]=field.type==='number'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):value}});return values}
export function bindComponent(html:string,settings:Partial<ComponentSettings>={},themePalette?:Palette){
 const palette=normalizePalette(settings.palette||themePalette),fields=(settings.fields||[]).map(f=>fieldSchema.parse(f)),values={...settings.values},mappings=settings.colorMappings||{},root:any=parseFragment(html)
 const ensureField=(key:string,n?:any)=>{if(!fields.some(f=>f.id===key)&&!colorToken.test(key))fields.push(fieldSchema.parse({id:key,label:key,type:attr(n,'data-qb-field-type')||'text',default:n?text(n):`${key}占位`}))}
 walk(root,n=>{if(attr(n,'data-qb-chart')){const chart=chartSchema.parse(JSON.parse(attr(n,'data-qb-chart')!));for(const key of chartReferences(chart))ensureField(key)}const key=attr(n,'data-qb-field');if(key)ensureField(key,n);if(n.nodeName==='#text')for(const m of n.value.matchAll(tokenPattern))ensureField(m[1]!);for(const [,v]of declarations(attr(n,'style')||''))for(const m of v.matchAll(tokenPattern))ensureField(m[1]!)})
 let auto=1
 walk(root,n=>{
  if(!['p','div','h2','h3','h4','figcaption'].includes(n.tagName)||attr(n,'data-qb-field')||!text(n).includes('占位'))return
  let parent=n.parentNode
  while(parent){if(attr(parent,'data-qb-field')||parent.tagName==='section'&&(parent.childNodes||[]).find((c:any)=>c.tagName)?.tagName==='p'&&text((parent.childNodes||[]).find((c:any)=>c.tagName)).trim()==='＋')return;parent=parent.parentNode}
  let nested=false;for(const child of n.childNodes||[])walk(child,c=>{if(['p','div','section','table','figure','img','h2','h3','h4'].includes(c.tagName))nested=true})
  if(nested||fields.length>=40)return
  while(fields.some(f=>f.id==='content'+auto))auto++
  const key='content'+auto++,label=text(n).replace(/占位/g,'').trim().slice(0,80)||'可修改文案'
  fields.push(fieldSchema.parse({id:key,label,type:'text',default:text(n)}));setAttr(n,'data-qb-field',key)
 })
 for(const [k,v]of Object.entries(extractFieldValues(html,fields)))if(values[k]===undefined&&fields.find(f=>f.id===k)?.default==='')values[k]=v
 const resolved=evaluateFields(fields,values)
 const substitute=(template:string,css=false)=>template.replace(tokenPattern,(_,key:string)=>colorToken.test(key)?resolveColor(key,palette,mappings):css?(Number.isFinite(Number(resolved[key]))?String(Number(resolved[key])):'0'):String(resolved[key]??''))
 const entries=paletteEntries(palette)
 walk(root,n=>{
  if(n.nodeName==='#text'&&tokenPattern.test(n.value)){
   tokenPattern.lastIndex=0
   const chunks:any[]=[];let last=0
   for(const match of n.value.matchAll(tokenPattern)){if(match.index!>last)chunks.push(textNode(n.value.slice(last,match.index)));const key=match[1]!;if(colorToken.test(key))chunks.push(textNode(resolveColor(key,palette,mappings)));else chunks.push(node('span',{'leaf':'','data-qb-field':key},[textNode(String(resolved[key]??''))]));last=match.index!+match[0].length}
   if(last<n.value.length)chunks.push(textNode(n.value.slice(last)));const at=n.parentNode.childNodes.indexOf(n);for(const c of chunks)c.parentNode=n.parentNode;n.parentNode.childNodes.splice(at,1,...chunks);return
  }
  if(!n.tagName)return
  const styles=declarations(attr(n,'style')||''),bindings=jsonMap(attr(n,'data-qb-styles')),customProperties=new Set((attr(n,'data-qb-custom-properties')||'').split(','))
  for(const prop of customProperties)delete bindings[prop]
  for(const [prop,token]of Object.entries(jsonMap(attr(n,'data-qb-colors'))))if(colorToken.test(token))bindings[prop]=`{{${token}}}`
  for(const [prop,value]of styles){
   if(value.includes('{{'))bindings[prop]=value
   else if(!bindings[prop]&&!customProperties.has(prop)&&!(prop==='color'&&attr(n,'data-qb-custom-color')==='true')&&/^(?:color|background-color|border(?:-(?:left|right|top|bottom))?(?:-color)?)$/.test(prop)){
    const color=normalizeHex(value)||normalizeHex(value.match(/#[\da-f]{3,8}\b|rgba?\([^)]*\)/i)?.[0]||'')
    const entry=entries.find(e=>normalizeHex(e.value)===color)
    if(entry){const name=prop.startsWith('border')&&!prop.endsWith('-color')?prop+'-color':prop;bindings[name]=`{{${entry.token}}}`}
   }
  }
  for(const [prop,template]of Object.entries(bindings)){const value=substitute(template,true);for(let i=styles.length-1;i>=0;i--)if(styles[i]![0]===prop)styles.splice(i,1);styles.push([prop,value])}
  if(Object.keys(bindings).length)setAttr(n,'data-qb-styles',JSON.stringify(bindings))
  if(styles.length)setAttr(n,'style',styles.map(([k,v])=>`${k}:${v};`).join(''))
  bindChartNode(n,resolved,t=>resolveColor(t,palette,mappings))
  const key=attr(n,'data-qb-field'),field=fields.find(f=>f.id===key)
  if(field){setAttr(n,'data-qb-field-type',field.type);if(field.type==='image'){
   const spec=inferImageSpec(attr(n,'style')||'',attr(n,'data-qb-image'),field.image);field.image=spec;setAttr(n,'data-qb-image',JSON.stringify(spec))
   const value=String(resolved[field.id]||'')
   if(value){const src=value.startsWith('/api/assets/')?value:`/api/assets/${value}/file`;fillImageNode(n,src,spec);if(!attr(n,'alt'))setAttr(n,'alt',field.label)}
   else if(n.tagName==='img'){const css=attr(n,'style')||'';setAttr(n,'style',css+(spec.ratio?`aspect-ratio:${spec.ratio};`:'min-height:100px;')+'text-align:center;');n.tagName='section';n.nodeName='section';n.attrs=n.attrs.filter((a:any)=>!['src','alt','width','height'].includes(a.name));n.childNodes=[node('p',{},[node('span',{leaf:''},[textNode('＋')])]),node('p',{},[node('span',{leaf:''},[textNode(field.label||'图片占位')])])]}
  }else {const value=String(resolved[field.id]??'');if(!text(n).includes('{{')&&text(n)!==value)n.childNodes=[node('span',{leaf:''},[textNode(value)])]}}
 })
 return {html:serialize(root),palette,fields,values:Object.fromEntries(fields.filter(f=>f.type!=='computed').map(f=>[f.id,resolved[f.id]??''])),colorMappings:mappings}
}
export function usedColorTokens(html:string){const tokens=new Set<string>(chartColorTokens(html));const root:any=parseFragment(html);walk(root,n=>{for(const value of Object.values(jsonMap(attr(n,'data-qb-styles'))))for(const m of value.matchAll(tokenPattern))if(colorToken.test(m[1]!))tokens.add(m[1]!)});return [...tokens].sort()}

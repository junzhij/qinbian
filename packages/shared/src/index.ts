import { parseFragment, serialize } from 'parse5'
import { z } from 'zod'
import { chartSchema, chartFromUrl } from './charts.ts'
import { imageSpecSchema, type ImageCrop } from './images.ts'
import { componentSettingsSchema, paletteSchema, bindComponent, type Palette, type ComponentSettings, type FieldDefinition } from './bindings.ts'
export * from './bindings.ts'
export * from './images.ts'
export * from './charts.ts'
export * from './resources.ts'
export * from './wechat.ts'
export * from './ids.ts'
export * from './snapshots.ts'

export const categories = ['封面与刊头','章节与分隔','正文与导读','新闻与现场','人物与访谈','学术与科研','数据与清单','活动与日程','通知与服务','图像与媒体','校园与叙事','互动与文末']
export const models = ['deepseek-v4-pro', 'deepseek-flash'] as const
export const rules = {
  typography: {
    heading: "'Songti SC',STSong,SimSun,serif",
    body: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
    caption: "-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif",
  },
  maxFontSize: 24,
  bodyFontSize: 15,
  widths: [320,375,414],
  imageLimit: 20 * 1024 * 1024,
  imageTypes: ['image/jpeg','image/png','image/webp','image/gif'],
  allowedTags: ['section','div','p','span','strong','b','em','i','u','s','a','img','figure','figcaption','hr','br','table','thead','tbody','tr','td','th','code','pre','ul','ol','li','h2','h3','h4'],
  blockedTags: ['script','style','iframe','object','embed','link','meta','svg','canvas','video','audio','form','input','button','textarea','select'],
}
const allowedStyles = new Set(['object-fit','object-position','aspect-ratio','box-sizing','width','height','max-width','min-width','max-height','margin','margin-top','margin-right','margin-bottom','margin-left','padding','padding-top','padding-right','padding-bottom','padding-left','color','background-color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','word-wrap','overflow-wrap','word-break','white-space','text-align','text-decoration','text-decoration-line','text-decoration-color','text-decoration-style','text-decoration-thickness','border','border-top','border-right','border-bottom','border-left','border-color','border-width','border-style','border-radius','border-collapse','border-spacing','table-layout','display','vertical-align','list-style-type','text-indent'])
for (const side of ['top','right','bottom','left']) for(const part of ['color','width','style']) allowedStyles.add(`border-${side}-${part}`)
for (const corner of ['top-left','top-right','bottom-left','bottom-right']) allowedStyles.add(`border-${corner}-radius`)

export function cleanStyle(style: string) {
  const declarations: string[] = []; let current='', quote='', depth=0
  for(const char of style){
    if(quote){current+=char;if(char===quote)quote='';continue}
    if(char==='"'||char==="'"){quote=char;current+=char;continue}
    if(char==='(')depth++;if(char===')')depth--
    if(char===';'&&depth===0){declarations.push(current);current=''}else current+=char
  }
  if(current)declarations.push(current)
  return declarations.flatMap(d=>{
    const at=d.indexOf(':');if(at<0)return[]
    const key=d.slice(0,at).trim().toLowerCase();let value=d.slice(at+1).trim()
    if(!allowedStyles.has(key)||!value||/[\\<>\x00-\x08]/.test(value)||/url\s*\(|expression\s*\(|var\s*\(|javascript|gradient|@import|\/\*/i.test(value))return[]
    if(key==='display'&&!['block','inline','inline-block','table','table-row','table-cell','none','list-item'].includes(value))return[]
    if(key==='font-size'){
      const m=value.match(/^([\d.]+)(px|pt|em|rem|%)$/i);if(!m)return[]
      const px=Number(m[1])*(({px:1,pt:4/3,em:15,rem:15,'%':.15} as Record<string,number>)[m[2]!.toLowerCase()]||1)
      if(px>rules.maxFontSize)value='24px'
    }
    return [`${key}:${value};`]
  }).join('')
}
export function escapeHtml(value: unknown){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))}
export const assetUrl = (id:string) => `/api/assets/${encodeURIComponent(id)}/file`
const validImage=(value:string)=>!!chartFromUrl(value)||/^\/api\/assets\/[a-zA-Z0-9_-]+\/file$/.test(value)||/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(value)
const safeLink=(value:string)=>/^(https?:\/\/|mailto:|tel:|#)/i.test(value)&&!/[\x00-\x20\\]/.test(value)
export function sanitizeHtml(source:string, portable=false):string {
  const root:any=parseFragment(String(source||'')); const walk=(parent:any,inLeaf=false,align='left')=>{
    const out:any[]=[]
    for(const node of parent.childNodes||[]){
      if(node.nodeName==='#comment')continue
      if(node.nodeName==='#text'){
        if(node.value.trim()&&!inLeaf){const span:any={nodeName:'span',tagName:'span',namespaceURI:'http://www.w3.org/1999/xhtml',attrs:[{name:'leaf',value:''}],childNodes:[node],parentNode:parent};node.parentNode=span;out.push(span)}else out.push(node)
        continue
      }
      if(!node.tagName)continue
      const tag=node.tagName.toLowerCase()
      if(rules.blockedTags.includes(tag))continue
      if(!rules.allowedTags.includes(tag)){walk(node,inLeaf,align);for(const child of node.childNodes||[]){child.parentNode=parent;out.push(child)};continue}
      const old=Object.fromEntries((node.attrs||[]).map((a:any)=>[a.name,a.value]));const attrs:any[]=[]
      let css=cleanStyle(old.style||'')
      const ownAlign=css.match(/(?:^|;)text-align:([^;]+)/)?.[1]||align
      if(['section','div','p','td','th','figure','figcaption','h2','h3','h4'].includes(tag)&&!/(?:^|;)text-align:/.test(css))css+=`text-align:${ownAlign};`
      if(css)attrs.push({name:'style',value:css})
      if(tag==='span'&&Object.hasOwn(old,'leaf'))attrs.push({name:'leaf',value:''})
      if(!portable){
        if(old['data-qb-chart']){try{if(old['data-qb-chart'].length<16000)attrs.push({name:'data-qb-chart',value:JSON.stringify(chartSchema.parse(JSON.parse(old['data-qb-chart'])))})}catch{}}
        if(old['data-qb-image']){try{const spec=imageSpecSchema.parse(JSON.parse(old['data-qb-image']));attrs.push({name:'data-qb-image',value:JSON.stringify(spec)})}catch{}}
        if(old['data-qb-custom-color']==='true')attrs.push({name:'data-qb-custom-color',value:'true'})
        if(old['data-qb-custom-properties']){const names=old['data-qb-custom-properties'].split(',').map((s:string)=>s.trim()).filter((s:string)=>allowedStyles.has(s));if(names.length)attrs.push({name:'data-qb-custom-properties',value:names.join(',')})}
        if(/^[a-zA-Z][\w.-]{0,63}$/.test(old['data-qb-field']||''))attrs.push({name:'data-qb-field',value:old['data-qb-field']})
        if(['text','number','image','computed'].includes(old['data-qb-field-type']))attrs.push({name:'data-qb-field-type',value:old['data-qb-field-type']})
        for(const name of ['data-qb-styles','data-qb-colors'])if(typeof old[name]==='string'&&old[name].length<5000){try{const m=JSON.parse(old[name]);if(m&&typeof m==='object'&&!Array.isArray(m)){const safe=Object.fromEntries(Object.entries(m).filter(([k,v])=>allowedStyles.has(k)&&typeof v==='string'&&!/[\\<>]/.test(v)&&!/(?:url|expression|javascript|var)\s*[:(]/i.test(v)));if(Object.keys(safe).length)attrs.push({name,value:JSON.stringify(safe)})}}catch{}}
      }
      if(tag==='a'&&safeLink(old.href||''))attrs.push({name:'href',value:old.href})
      if(tag==='img'){
        if(validImage(old.src||''))attrs.push({name:'src',value:old.src})
        for(const k of ['alt','width','height'])if(old[k]!==undefined&&(k==='alt'||/^\d{1,4}$/.test(old[k])))attrs.push({name:k,value:old[k]})
        if(!portable&&/^[a-zA-Z0-9_-]+$/.test(old['data-asset-id']||''))attrs.push({name:'data-asset-id',value:old['data-asset-id']})
      }
      for(const k of ['colspan','rowspan'])if(['th','td'].includes(tag)&&/^\d{1,2}$/.test(old[k]||''))attrs.push({name:k,value:old[k]})
      if(!portable&&['ratio','ratio-value','ratio-total','ratio-unit','ratio-label','ratio-source'].some(k=>Object.hasOwn(old,'data-'+k))){for(const [k,v]of Object.entries(old))if(/^data-ratio(?:-(?:value|total|unit|label|source))?$/.test(k))attrs.push({name:k,value:String(v)})}
      node.attrs=attrs;walk(node,inLeaf||(tag==='span'&&Object.hasOwn(old,'leaf')),ownAlign);out.push(node)
    }
    parent.childNodes=out
  };walk(root);return serialize(root)
}
export function htmlAssetIds(html:string){return [...new Set([...html.matchAll(/\/api\/assets\/([a-zA-Z0-9_-]+)\/file/g)].map(m=>m[1]!))]}
export function inspectHtml(source:string){
  const issues:string[]=[]
  if(!source.trim())issues.push('组件内容不能为空')
  if(source.length>500_000)issues.push('组件内容超过500 KB')
  if(/<\s*(script|iframe|object|embed|svg|style|form)\b/i.test(source)||/\son\w+\s*=/i.test(source))issues.push('包含不允许的脚本、控件或事件属性')
  if(/(?:javascript\s*:|expression\s*\(|var\s*\(|gradient\s*\(|position\s*:\s*(?:absolute|fixed))/i.test(source))issues.push('包含不适合公众号正文的样式或地址')
  const clean=sanitizeHtml(source)
  const tree:any=parseFragment(clean)
  const visit=(n:any)=>{if(n.tagName==='img'&&!(n.attrs||[]).some((a:any)=>a.name==='src'&&a.value))issues.push('图片必须来自素材库');for(const c of n.childNodes||[])visit(c)};visit(tree)
  return {html:clean,issues:[...new Set(issues)],assetIds:htmlAssetIds(clean)}
}
export function prepareComponent(data:{html?:string}&Partial<ComponentSettings>,palette?:Palette){const result=bindComponent(data.html||'',data,palette);return{...result,html:sanitizeHtml(result.html)}}
export const blockSchema=z.object({id:z.string().min(1),sourceComponentId:z.string().nullable().optional(),name:z.string().default('图文组件'),legacyId:z.string().nullable().optional(),html:z.string().max(500_000),assetIds:z.array(z.string()).default([]),...componentSettingsSchema.partial().shape})
export type Block=z.infer<typeof blockSchema>
export const resourceInput=z.object({themeSetId:z.string().default('mine'),kind:z.enum(['component','template','palette']),name:z.string().trim().min(1).max(100),description:z.string().max(1000).default(''),category:z.string().max(100).default('正文与导读'),tags:z.array(z.string().max(40)).max(20).default([]),data:z.object({html:z.string().max(500_000).optional(),blocks:z.array(blockSchema).max(200).optional(),...componentSettingsSchema.partial().shape}),revision:z.number().int().positive().optional()})
export const documentInput=z.object({title:z.string().trim().min(1).max(150),themeSetId:z.string().default('mine'),blocks:z.array(blockSchema).max(200).default([]),revision:z.number().int().positive().optional()})
export const themeInput=z.object({name:z.string().trim().min(1).max(80),description:z.string().max(1000).default(''),tokens:z.record(z.string(),z.string()).default({}),palette:paletteSchema.optional(),rules:z.string().max(4000).default('')})
export const aiInput=z.object({operation:z.enum(['generate','edit','palette']),prompt:z.string().trim().min(2).max(4000),themeSetId:z.string().default('shanhai'),model:z.enum(models).optional(),colorCount:z.number().int().min(3).max(6).optional(),palette:paletteSchema.optional(),referenceIds:z.array(z.string()).max(2).default([]),assetIds:z.array(z.string()).max(8).default([]),sourceHtml:z.string().max(500_000).optional(),settings:componentSettingsSchema.partial().optional(),targetType:z.enum(['resource','document']).optional(),targetId:z.string().optional(),targetRevision:z.number().int().optional(),blockId:z.string().optional()})
export type AiInput=z.infer<typeof aiInput>
export interface ThemeSet {id:string;name:string;description:string;builtin:boolean;tokens:Record<string,string>;palette?:Palette;rules:string;createdAt:string;updatedAt:string;deletedAt:string|null}
export interface ComponentData extends Partial<ComponentSettings>{html?:string;blocks?:Block[]}
export interface Resource {id:string;themeSetId:string;kind:'component'|'template'|'palette';name:string;description:string;category:string;tags:string[];legacyId:string|null;builtin:boolean;data:ComponentData;revision:number;deletedAt:string|null;createdAt:string;updatedAt:string}
export interface Article {id:string;title:string;themeSetId:string;blocks:Block[];revision:number;deletedAt:string|null;createdAt:string;updatedAt:string}
export interface Asset {id:string;name:string;fileName:string;mime:string;bytes:number;width:number;height:number;hash:string;builtin:boolean;deletedAt:string|null;createdAt:string;sourceAssetId?:string|null;crop?:ImageCrop|null;references?:{type:string;id:string;name:string}[]}
export interface AiResult extends Partial<ComponentSettings>{kind?:'component'|'palette';name:string;description:string;category:string;tags:string[];html:string}
export interface AiJob {id:string;operation:'generate'|'edit'|'palette';status:'queued'|'running'|'validating'|'ready'|'failed'|'cancelled'|'applied';model:string;request:AiInput;result:null|AiResult;error:string|null;usage:Record<string,number>|null;createdAt:string;updatedAt:string}
export function articleHtml(blocks:Block[]){return `<section style="box-sizing:border-box;max-width:680px;margin:0 auto;padding:20px 18px;background-color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif;font-size:15px;line-height:1.85;color:#293F4F;text-align:left;">${blocks.map(b=>sanitizeHtml(b.html)).join('')}</section>`}

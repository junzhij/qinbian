import { z } from 'zod'
import { parseFragment } from 'parse5'

export const chartTypes=['line','area','bar','horizontalBar','pie','donut'] as const
const ref=z.string().regex(/^\{\{[a-zA-Z][\w.-]{0,63}\}\}$/)
const color=z.string().regex(/^(?:color[1-6]-(?:regular|highlight|light)|#[\da-fA-F]{6})$/)
export const chartSchema=z.object({type:z.enum(chartTypes),labels:z.array(z.string().max(80)).min(1).max(12),series:z.array(z.object({name:z.string().max(60),values:z.array(z.union([z.number().finite().min(-1e12).max(1e12),z.null(),ref])).min(1).max(12)})).min(1).max(3),colors:z.array(color).min(1).max(6).default(['color1-regular','color2-regular','color3-regular']),unit:z.string().max(30).default('')}).superRefine((c,ctx)=>{
 if(c.series.some(s=>s.values.length!==c.labels.length))ctx.addIssue({code:'custom',message:'每组图表数值须与分类数量一致'})
 if(['pie','donut'].includes(c.type)&&(c.series.length!==1||c.labels.length>6))ctx.addIssue({code:'custom',message:'饼图与环图使用一组数据、最多6个分类'})
 if(['pie','donut'].includes(c.type)&&c.series.some(s=>s.values.some(v=>typeof v==='number'&&v<0)))ctx.addIssue({code:'custom',message:'饼图与环图不能使用负数'})
})
export type ChartSpec=z.infer<typeof chartSchema>
export interface ResolvedChart {type:ChartSpec['type'];labels:string[];series:{name:string;values:(number|null)[]}[];colors:string[];unit:string}
export function resolveChart(spec:ChartSpec,values:Record<string,string|number>,resolveColor:(token:string)=>string):ResolvedChart{
 const text=(s:string)=>s.replace(/\{\{([a-zA-Z][\w.-]{0,63})\}\}/g,(_,key)=>String(values[key]??''))
 const result:ResolvedChart={...spec,labels:spec.labels.map(text),unit:text(spec.unit),colors:spec.colors.map(c=>c.startsWith('#')?c:resolveColor(c)),series:spec.series.map(s=>({name:text(s.name),values:s.values.map(v=>{if(typeof v==='string'){const key=v.slice(2,-2),value=values[key];return value===undefined||value===''||!Number.isFinite(Number(value))?null:Number(value)}return v})}))}
 chartSchema.parse(result);return result
}
export function chartUrl(chart:ResolvedChart){return '/api/charts/render?spec='+encodeURIComponent(JSON.stringify({...chart,renderVersion:2}))}
export function chartFromUrl(url:string):ResolvedChart|null{
 if(!url.startsWith('/api/charts/render?spec=')||url.length>20000)return null
 try{const raw=JSON.parse(decodeURIComponent(url.slice('/api/charts/render?spec='.length))),s=chartSchema.parse(raw);if(s.colors.some(c=>!/^#[\da-fA-F]{6}$/.test(c))||s.series.some(s=>s.values.some(v=>typeof v==='string')))return null;return s as ResolvedChart}catch{return null}
}
export function chartReferences(spec:ChartSpec){const text=JSON.stringify(spec);return [...new Set([...text.matchAll(/\{\{([a-zA-Z][\w.-]{0,63})\}\}/g)].map(m=>m[1]!))]}
const attr=(n:any,key:string)=>(n.attrs||[]).find((a:any)=>a.name===key)?.value as string|undefined
export function chartColorTokens(html:string){const tokens=new Set<string>(),root:any=parseFragment(html);const visit=(n:any)=>{try{const s=chartSchema.parse(JSON.parse(attr(n,'data-qb-chart')||''));for(const c of s.colors)if(c.startsWith('color'))tokens.add(c)}catch{}for(const c of n.childNodes||[])visit(c)};visit(root);return [...tokens]}
function node(tag:string,attrs:Record<string,string>,children:any[]=[]){const n:any={nodeName:tag,tagName:tag,namespaceURI:'http://www.w3.org/1999/xhtml',attrs:Object.entries(attrs).map(([name,value])=>({name,value})),childNodes:children};for(const c of children)c.parentNode=n;return n}
const textNode=(value:string)=>({nodeName:'#text',value})
export function bindChartNode(n:any,values:Record<string,string|number>,resolveColor:(token:string)=>string){
 const raw=attr(n,'data-qb-chart');if(!raw)return
 const spec=chartSchema.parse(JSON.parse(raw)),chart=resolveChart(spec,values,resolveColor)
 const leaf=(value:string,reference?:string)=>node('span',{leaf:'',...(reference?.match(/^\{\{([\w.-]+)\}\}$/)?{'data-qb-field':reference.slice(2,-2)}:{})},[textNode(value)])
 const rows=chart.labels.map((label,i)=>node('p',{style:'margin:4px 0;font-size:12px;line-height:1.8;text-indent:0;'},[leaf(label,spec.labels[i]),textNode('　'),...chart.series.flatMap((s,j)=>[...(chart.series.length>1?[textNode(s.name+'：')]:[]),leaf(s.values[i]===null?'—':String(s.values[i]),typeof spec.series[j]!.values[i]==='string'?String(spec.series[j]!.values[i]):undefined),textNode(chart.unit||''),...(j<chart.series.length-1?[textNode(' / ')]:[])])]))
 // Data remains visible and editable even when an image fails to load.
 n.childNodes=[node('img',{src:chartUrl(chart),alt:chart.labels.map((l,i)=>l+' '+chart.series.map(s=>s.values[i]??'缺失').join('/')).join('；'),style:'width:100%;max-width:100%;height:auto;display:block;margin:0 auto 12px;'}),node('section',{style:'margin:8px 0 0;'},rows)]
 for(const c of n.childNodes)c.parentNode=n
}

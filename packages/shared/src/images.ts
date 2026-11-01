import { parseFragment, serialize } from 'parse5'
import { z } from 'zod'

export const imageSpecSchema=z.object({shape:z.enum(['rect','circle','rounded']).default('rect'),ratio:z.number().min(.1).max(10).optional(),radius:z.number().min(0).max(.5).optional()})
export type ImageSpec=z.infer<typeof imageSpecSchema>
export const cropRectSchema=z.object({x:z.number().min(0).max(1),y:z.number().min(0).max(1),width:z.number().positive().max(1),height:z.number().positive().max(1)}).refine(r=>r.x+r.width<=1.000001&&r.y+r.height<=1.000001,'裁切范围不能超出原图')
export const cropInputSchema=z.object({spec:imageSpecSchema,rect:cropRectSchema.optional()})
export type CropRect=z.infer<typeof cropRectSchema>
export interface ImageCrop {spec:ImageSpec;rect:CropRect}
export const imageAttr=(n:any,key:string):string=>(n.attrs||[]).find((a:any)=>a.name===key)?.value||''
export function setImageAttr(n:any,key:string,value:string){n.attrs=n.attrs||[];const a=n.attrs.find((a:any)=>a.name===key);if(a)a.value=value;else n.attrs.push({name:key,value})}
function cssMap(css:string):Record<string,string>{return Object.fromEntries(css.split(';').map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim(),s.slice(i+1).trim()]}).filter(([k,v])=>k&&v))}
const px=(v:string='')=>/^\d+(?:\.\d+)?(?:px)?$/.test(v)?parseFloat(v):0
export function inferImageSpec(style:string,metadata?:string,explicit?:ImageSpec):ImageSpec {
 let stored:Partial<ImageSpec>={};try{stored=imageSpecSchema.parse(JSON.parse(metadata||'{}'))}catch{}
 const css=cssMap(style),width=px(css.width),height=px(css.height),radius=css['border-radius']||''
 const shape=/(?:50%|(?:999|1000)\d*px)/.test(radius)?'circle':px(radius)>0?'rounded':'rect'
 const inferred:ImageSpec={shape,...(width&&height?{ratio:width/height}:{}),...(shape==='rounded'&&width&&height?{radius:Math.min(.5,px(radius)/Math.min(width,height))}:{})}
 const result=imageSpecSchema.parse({...inferred,...explicit,...(metadata?stored:{})})
 if(result.shape==='circle')result.ratio=1
 return result
}
export function centerCrop(width:number,height:number,ratio=width/height):CropRect {
 const w=Math.min(width,height*ratio),h=w/ratio
 return{x:(width-w)/2/width,y:(height-h)/2/height,width:w/width,height:h/height}
}
const walk=(n:any,fn:(n:any)=>void)=>{fn(n);for(const c of n.childNodes||[])walk(c,fn)}
const plain=(n:any):string=>n.nodeName==='#text'?n.value:(n.childNodes||[]).map(plain).join('')
export function imageNodes(root:any):any[]{
 const result:any[]=[]
 const visit=(n:any)=>{if(imageAttr(n,'data-qb-field-type')==='image'||n.tagName==='img'||['section','div'].includes(n.tagName)&&(n.childNodes||[]).find((c:any)=>c.tagName)?.tagName==='p'&&plain((n.childNodes||[]).find((c:any)=>c.tagName)).trim()==='＋'){result.push(n);return}for(const c of n.childNodes||[])visit(c)}
 visit(root);return result
}
export function imageSource(n:any){let src='';walk(n,c=>{if(c.tagName==='img')src=imageAttr(c,'src')});return src}
export function fillImageNode(n:any,src:string,spec:ImageSpec,alt?:string){
 const placeholder=n.tagName!=='img'
 let inner:any;walk(n,c=>{if(c.tagName==='img')inner=c})
 const oldAlt=imageAttr(inner||{},'alt'),css={...cssMap(imageAttr(inner||{},'style')),...cssMap(imageAttr(n,'style'))}
 if(placeholder)for(const prop of ['background-color','padding','padding-left','padding-right','padding-top','padding-bottom','line-height','font-size','text-align','overflow'])delete css[prop]
 css['box-sizing']='border-box';css['max-width']='100%';css.height='auto';css.display='block'
 if(!css.margin)css.margin='0 auto'
 if(spec.ratio){css['aspect-ratio']=String(spec.ratio);css['object-fit']='cover'}else{delete css['aspect-ratio'];delete css['object-fit']}
 if(spec.shape==='circle')css['border-radius']='50%'
 else if(spec.shape==='rounded')css['border-radius']=`${(spec.radius??.08)*100}%`
 else delete css['border-radius']
 n.tagName='img';n.nodeName='img';n.childNodes=[]
 // Preserve field IDs and layout; the empty placeholder's paint is not a frame.
 n.attrs=(n.attrs||[]).filter((a:any)=>!['src','style','alt','height'].includes(a.name))
 try{const bindings=JSON.parse(imageAttr(n,'data-qb-styles')||'{}');for(const k of (placeholder?['background-color','height','padding']:['height']))delete bindings[k];n.attrs=n.attrs.filter((a:any)=>a.name!=='data-qb-styles');if(Object.keys(bindings).length)setImageAttr(n,'data-qb-styles',JSON.stringify(bindings))}catch{}
 setImageAttr(n,'src',src);setImageAttr(n,'alt',alt??oldAlt)
 setImageAttr(n,'style',Object.entries(css).map(([k,v])=>`${k}:${v};`).join(''))
 setImageAttr(n,'data-qb-image',JSON.stringify(spec))
}
export function imageSlots(html:string){return imageNodes(parseFragment(html)).map(n=>({src:imageSource(n),fieldId:imageAttr(n,'data-qb-field'),spec:inferImageSpec(imageAttr(n,'style'),imageAttr(n,'data-qb-image')),alt:imageAttr(n,'alt')}))}
export function replaceImageSlot(html:string,index:number,src:string,alt:string,spec?:ImageSpec){
 const root:any=parseFragment(html),target=imageNodes(root)[index]
 if(target)fillImageNode(target,src,spec||inferImageSpec(imageAttr(target,'style'),imageAttr(target,'data-qb-image')),alt)
 return serialize(root)
}

export async function materializeImages(html:string,resolve:(src:string,spec:ImageSpec)=>Promise<string>){
 const root:any=parseFragment(html)
 for(const n of imageNodes(root)){const src=imageSource(n);if(!src)continue;const spec=inferImageSpec(imageAttr(n,'style'),imageAttr(n,'data-qb-image'));fillImageNode(n,await resolve(src,spec),spec)}
 return serialize(root)
}

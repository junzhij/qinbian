import { sanitizeHtml, escapeHtml } from '@qinbian/shared'

/** Element-only paths remain stable when text is wrapped in leaf spans. */
export function elementPath(root:HTMLElement,element:Element):number[]|null {
 if(!root.contains(element))return null
 const path:number[]=[];let node:Element=element
 while(node!==root){const parent=node.parentElement;if(!parent)return null;path.unshift(Array.from(parent.children).indexOf(node));node=parent}
 return path
}
export function elementAtPath(root:HTMLElement,path:number[]):HTMLElement|null {
 let element:Element=root
 for(const index of path){const child=element.children.item(index);if(!child)return null;element=child}
 return element instanceof HTMLElement?element:null
}
export function editableTextElement(root:HTMLElement,target:HTMLElement):HTMLElement|null {
 const declared=target.closest('[data-qb-field]:not([data-qb-field-type="image"])') as HTMLElement|null
 if(declared&&root.contains(declared))return declared
 const paragraph=target.closest('p,h2,h3,h4,figcaption,td,th,li') as HTMLElement|null
 if(paragraph&&root.contains(paragraph))return paragraph
 let result:HTMLElement|null=null,node:HTMLElement|null=target
 while(node&&node!==root){
  if(node.querySelector('section,div,p,h2,h3,h4,table,figure,img,ul,ol,li'))break
  if(node.textContent?.trim()&&['SPAN','DIV','SECTION','BLOCKQUOTE'].includes(node.tagName))result=node
  node=node.parentElement
 }
 return result
}
export function paragraphContent(element:HTMLElement):string {
 const alignment=element.style.textAlign||getComputedStyle(element).textAlign
 const align=/^(left|right|center|justify|start|end)$/.test(alignment)?` style="text-align:${escapeHtml(alignment)};"`:''
 return `<p${align}>${element.innerHTML}</p>`
}
/** Only the temporary host enters ProseMirror; the component never does. */
export function mountParagraphHost(element:HTMLElement):HTMLElement {
 const computed=getComputedStyle(element),style=element.getAttribute('style')||''
 const host=document.createElement('div');host.className='inline-rich-host'
 if(/^(P|H[234])$/.test(element.tagName)){
  host.setAttribute('style',style)
  for(const name of ['font-family','font-size','font-weight','font-style','line-height','letter-spacing','color','text-align','text-indent','margin-top','margin-right','margin-bottom','margin-left'])host.style.setProperty(name,computed.getPropertyValue(name))
  element.replaceWith(host)
 }else element.replaceChildren(host)
 return host
}
export function composeParagraph(base:string,path:number[],editorHtml:string,nextPath?:number[]):{html:string;nextPath:number[]|null} {
 const root=document.createElement('div');root.innerHTML=base
 const target=elementAtPath(root,path)
 if(!target)return {html:base,nextPath:null}
 const next=nextPath?elementAtPath(root,nextPath):null
 const content=document.createElement('div');content.innerHTML=editorHtml
 const paragraphs=Array.from(content.children) as HTMLElement[]
 const mergeAlignment=(node:HTMLElement,from:HTMLElement)=>{const alignment=from.style.textAlign;if(alignment&&node.style.textAlign!==alignment)node.style.textAlign=alignment;const keys=new Set([...(node.getAttribute('data-qb-custom-properties')||'').split(','),...(from.getAttribute('data-qb-custom-properties')||'').split(',')].filter(Boolean));if(keys.size)node.setAttribute('data-qb-custom-properties',[...keys].join(','))}
 if(paragraphs.length===1&&paragraphs[0]!.tagName==='P'){
  target.innerHTML=paragraphs[0]!.innerHTML;mergeAlignment(target,paragraphs[0]!)
 }else if(/^(P|H[234])$/.test(target.tagName)){
  const replacements=paragraphs.map(p=>{const replacement=target.cloneNode(false) as HTMLElement;replacement.innerHTML=p.innerHTML;mergeAlignment(replacement,p);return replacement})
  target.replaceWith(...replacements)
 }else{
  for(const p of paragraphs)p.style.margin='0'
  target.replaceChildren(...paragraphs)
 }
 return {html:sanitizeHtml(root.innerHTML),nextPath:next&&root.contains(next)?elementPath(root,next):null}
}

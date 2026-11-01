export function plainText(html:string){return new DOMParser().parseFromString(html,'text/html').body.textContent||''}
export function setRichClipboard(event:ClipboardEvent,html:string){
 if(!event.clipboardData)return
 event.preventDefault();event.clipboardData.setData('text/html',html);event.clipboardData.setData('text/plain',plainText(html))
}
export function copyRichHtml(html:string){
 const selected=window.getSelection(),ranges=selected?Array.from({length:selected.rangeCount},(_,i)=>selected.getRangeAt(i).cloneRange()):[],focused=document.activeElement as HTMLElement|null
 const host=document.createElement('div');host.contentEditable='true';host.style.cssText='position:fixed;left:-10000px;top:0;width:375px;';host.innerHTML=html;document.body.append(host)
 const copied=(event:ClipboardEvent)=>setRichClipboard(event,html)
 document.addEventListener('copy',copied)
 try{host.focus();const range=document.createRange();range.selectNodeContents(host);selected?.removeAllRanges();selected?.addRange(range);return document.execCommand('copy')}
 catch{return false}
 finally{document.removeEventListener('copy',copied);host.remove();selected?.removeAllRanges();for(const range of ranges)selected?.addRange(range);focused?.focus({preventScroll:true})}
}

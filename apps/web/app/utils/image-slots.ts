import { assetUrl, type Asset, type ImageSpec } from '@qinbian/shared'

export function imageElements(root:HTMLElement){
 return Array.from(root.querySelectorAll<HTMLElement>('section,div,img')).filter(el=>{
  if(el.closest('[data-qb-chart]'))return false
  if(el.parentElement?.closest('[data-qb-field-type="image"]'))return false
  return el.dataset.qbFieldType==='image'||el.tagName==='IMG'||el.firstElementChild?.tagName==='P'&&el.firstElementChild.textContent?.trim()==='＋'
 })
}
export const assetIdFromUrl=(src:string)=>src.match(/^\/api\/assets\/([a-zA-Z0-9_-]+)\/file$/)?.[1]||''
export async function fitImageAsset(asset:Asset,spec:ImageSpec):Promise<Asset>{
 if(spec.shape==='rect'&&!spec.ratio)return asset
 if(asset.crop&&asset.crop.spec.shape===spec.shape&&Math.abs((asset.crop.spec.ratio||asset.width/asset.height)-(spec.ratio||asset.width/asset.height))<.001&&(spec.shape!=='rounded'||(asset.crop.spec.radius??.08)===(spec.radius??.08)))return asset
 return await apiFetch<Asset>(`/api/assets/${asset.id}/crop`,{method:'POST',body:{spec}})
}

export function imageIndexAtPath(html:string,path:number[]){const root=document.createElement('div');root.innerHTML=html;let target:Element=root;for(const i of path){const next=target.children.item(i);if(!next)return 0;target=next}return Math.max(0,imageElements(root).indexOf(target as HTMLElement))}

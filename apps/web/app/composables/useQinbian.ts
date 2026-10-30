import type { ThemeSet } from '@qinbian/shared'
import { $fetch as baseFetch } from 'ofetch'
export const apiFetch = baseFetch.create({})
export function useQinbian(){
 const themes=useState<ThemeSet[]>('themes',()=>[])
 const activeTheme=useState<string>('active-theme',()=> 'shanhai')
 const notices=useState<{id:number;text:string;error:boolean}[]>('notices',()=>[])
 const menuOpen=useState('menu-open',()=>false)
 const refreshThemes=async()=>{themes.value=await apiFetch<ThemeSet[]>('/api/theme-sets')}
 const notify=(text:string,error=false)=>{const id=Date.now()+Math.random();notices.value.push({id,text,error});setTimeout(()=>{notices.value=notices.value.filter(n=>n.id!==id)},error?7000:3500)}
 const error=(e:any)=>notify(e?.data?.message||e?.message||'操作未完成，请重试',true)
 const chooseTheme=(id:string)=>{activeTheme.value=id;menuOpen.value=false;navigateTo('/')}
 return {themes,activeTheme,notices,menuOpen,refreshThemes,notify,error,chooseTheme}
}
export function downloadFile(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
export function formatDate(value:string){return new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}

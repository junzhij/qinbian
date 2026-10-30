import { networkInterfaces } from 'node:os'

export function localLanAddresses():string[] {
 return [...new Set(Object.values(networkInterfaces()).flatMap(items=>(items||[]).filter(a=>a.family==='IPv4'&&!a.internal&&/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a=>a.address)))]
}

export function isAllowedOrigin(origin:string,settings:{lan:boolean;webPort:number},addresses=localLanAddresses()):boolean {
 try {
  const url=new URL(origin)
  if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)return false
  if(['127.0.0.1','localhost','[::1]'].includes(url.hostname))return true
  return settings.lan&&Number(url.port||(url.protocol==='https:'?443:80))===settings.webPort&&addresses.includes(url.hostname)
 }catch{return false}
}

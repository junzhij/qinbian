import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here=dirname(fileURLToPath(import.meta.url))
export const root=process.env.QINBIAN_ROOT||resolve(here,'../../..')
function readCredential(){
  if(process.env.DEEPSEEK_API_KEY)return process.env.DEEPSEEK_API_KEY.trim()
  const file=process.env.QINBIAN_ENV_FILE||resolve(root,'env')
  if(!existsSync(file))return ''
  let content:string
  try{content=readFileSync(file,'utf8').replace(/^\uFEFF/,'').trim()}catch{return ''}
  const explicit=content.match(/(?:^|\n)\s*(?:export\s+)?DEEPSEEK_API_KEY\s*[=:：]\s*["']?([^\s"']+)/)
  if(explicit)return explicit[1]
  const keys=content.match(/sk-[A-Za-z0-9_-]{20,}/g)||[]
  return keys.length===1?keys[0]:''
}
export interface Config {root:string;dataDir:string;seedDir:string;apiKey:string;aiBase:string;aiTimeout:number;port:number;lan:boolean;webPort:number;allowTestOrigin?:boolean}
export function config(overrides:Partial<Config>={}):Config {return {root,dataDir:process.env.QINBIAN_DATA_DIR||resolve(root,'data'),seedDir:resolve(root,'seed'),apiKey:overrides.apiKey??readCredential(),aiBase:process.env.DEEPSEEK_BASE_URL||'https://api.deepseek.com',aiTimeout:180_000,port:Number(process.env.API_PORT||3031),lan:process.env.QINBIAN_LAN==='1',webPort:Number(process.env.QINBIAN_WEB_PORT||3030),...overrides}}

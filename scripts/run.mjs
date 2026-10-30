import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir, networkInterfaces } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [process.env.QINBIAN_NODE, process.execPath, resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')].filter(Boolean)
const node = candidates.find(p => existsSync(p) && spawnSync(p, ['-p', 'process.versions.node.split(".")[0]'], {encoding:'utf8'}).stdout.trim() === '24')
if (!node) { console.error('秦编需要 Node.js 24 LTS，请安装后重试，或设置 QINBIAN_NODE 指向 Node 24。'); process.exit(1) }
const env = {...process.env, PATH: `${dirname(node)}:${process.env.PATH}`, QINBIAN_ROOT: root}
const webRoot=resolve(root,'apps/web')
const nuxt=resolve(webRoot,'node_modules/nuxt/bin/nuxt.mjs')
const children = []
function launch(args, opts={}) {
  const child = spawn(node, args, {cwd:root, env, stdio:'inherit', ...opts}); children.push(child); return child
}
function run(args) { return new Promise((resolve,reject)=>{const c=launch(args); c.on('error',reject); c.on('exit',code=>code===0?resolve():reject(new Error(`命令退出 ${code}`)))}) }
const stop=()=>{ for(const c of children) if(c.exitCode===null)c.kill('SIGTERM') }
process.on('SIGINT',stop);process.on('SIGTERM',()=>{stop();process.exit(0)})
const mode=process.argv[2]||'dev'
if (mode==='dev'||mode==='start') {
  const preferenceFile=resolve(root,'data/network.json')
  let preference={lan:false}
  try{preference={lan:JSON.parse(readFileSync(preferenceFile,'utf8')).lan===true}}catch{}
  const explicitLan=process.argv.includes('--lan'),explicitLocal=process.argv.includes('--local')
  const lan=explicitLocal?false:explicitLan?true:process.env.QINBIAN_LAN!==undefined?process.env.QINBIAN_LAN==='1':preference.lan
  if(explicitLan||explicitLocal){mkdirSync(dirname(preferenceFile),{recursive:true});writeFileSync(preferenceFile,JSON.stringify({lan},null,2)+'\n')}
  const webPort=Number(process.env.QINBIAN_WEB_PORT||3030),apiPort=Number(process.env.API_PORT||3031),webHost=lan?'0.0.0.0':'127.0.0.1'
  env.QINBIAN_LAN=lan?'1':'0';env.QINBIAN_WEB_PORT=String(webPort)
  env.NUXT_API_BASE=`http://127.0.0.1:${apiPort}`
  const api=launch(mode==='dev'?['--import','tsx','apps/api/src/server.ts']:['apps/api/dist/server.js'])
  api.on('exit',code=>{if(code){stop();process.exit(code)}})
  let ready=false
  for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${apiPort}/api/health`);if(r.ok){ready=true;break}}catch{} await new Promise(r=>setTimeout(r,150))}
  if(!ready){stop();throw new Error('后端未能启动，请查看上面的错误提示。')}
  const web=mode==='dev'?launch([nuxt,'dev','--host',webHost,'--port',String(webPort)],{cwd:webRoot}):launch(['apps/web/.output/server/index.mjs'],{env:{...env,NITRO_HOST:webHost,NITRO_PORT:String(webPort)}})
  if(lan){const addresses=[...new Set(Object.values(networkInterfaces()).flatMap(items=>(items||[]).filter(a=>a.family==='IPv4'&&!a.internal&&/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a=>a.address)))];for(const address of addresses)console.log(`局域网访问：http://${address}:${webPort}`)}
  web.on('exit',code=>{stop();process.exit(code||0)})
} else if(mode==='build') {
  await run([resolve(root,'apps/api/node_modules/tsup/dist/cli-default.js'),'apps/api/src/server.ts','--format','esm','--platform','node','--target','node24','--config','apps/api/tsup.config.ts','--out-dir','apps/api/dist']);await new Promise((resolveDone,reject)=>{const c=launch([nuxt,'build'],{cwd:webRoot});c.on('exit',code=>code===0?resolveDone():reject(new Error('前端构建未通过')))})
} else if(mode==='typecheck') {
  await run([resolve(root,'node_modules/typescript/bin/tsc'),'--noEmit']);await run([resolve(webRoot,'node_modules/vue-tsc/bin/vue-tsc.js'),'--noEmit','-p','apps/web/tsconfig.json'])
} else if(mode==='test') {
  await run(['--import','tsx','--test',...readdirSync(resolve(root,'tests')).filter(x=>x.endsWith('.test.ts')).map(x=>'tests/'+x)])
} else if(mode==='migrate') {
  await run(['--import','tsx','apps/api/src/migrate.ts'])
} else throw new Error('未知命令')

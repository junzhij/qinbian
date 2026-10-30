import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, copyFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import yazl from 'yazl'
import yauzl from 'yauzl'
import { Store, fail } from './store.ts'

export async function makeBackup(store:Store){
 const key=randomUUID(),work=resolve(store.config.dataDir,'temporary',key);mkdirSync(work,{recursive:true})
 const sqlite=join(work,'qinbian.sqlite');await store.sqlite.backup(sqlite)
 const file=resolve(store.config.dataDir,'backups',`qinbian-${Date.now()}.zip`),zip=new yazl.ZipFile()
 zip.addFile(sqlite,'qinbian.sqlite')
 zip.addBuffer(Buffer.from(JSON.stringify({format:'qinbian-backup',version:1,createdAt:new Date().toISOString()})),'manifest.json')
 for(const folder of ['uploads','thumbs'])for(const name of readdirSync(resolve(store.config.dataDir,folder))){if(/^[a-zA-Z0-9_.-]+$/.test(name))zip.addFile(resolve(store.config.dataDir,folder,name),folder+'/'+name)}
 const done=pipeline(zip.outputStream,createWriteStream(file));zip.end();await done;rmSync(work,{recursive:true,force:true});return file
}
async function extract(file:string,destination:string){
 await new Promise<void>((resolveDone,reject)=>yauzl.open(file,{lazyEntries:true,validateEntrySizes:true},(err,zip)=>{
  if(err||!zip)return reject(new Error('无法打开备份文件'))
  let total=0,count=0
  const abort=(e:Error)=>{zip.close();reject(e)}
  zip.on('error',abort);zip.on('end',resolveDone)
  zip.on('entry',(entry:yauzl.Entry)=>{
   const name=entry.fileName
   if(!/^(manifest\.json|qinbian\.sqlite|(?:uploads|thumbs)\/[a-zA-Z0-9_.-]+)$/.test(name)||name.includes('..'))return abort(new Error('备份包含不支持的文件路径'))
   total+=entry.uncompressedSize;count++
   if(total>1024*1024*1024||count>10000)return abort(new Error('备份内容过大'))
   zip.openReadStream(entry,(e,stream)=>{if(e||!stream)return abort(new Error('备份读取失败'));pipeline(stream,createWriteStream(join(destination,name))).then(()=>zip.readEntry()).catch(abort)})
  });zip.readEntry()
 }))
}
export async function restoreBackup(store:Store,file:string){
 const work=resolve(store.config.dataDir,'temporary',randomUUID());mkdirSync(join(work,'uploads'),{recursive:true});mkdirSync(join(work,'thumbs'),{recursive:true})
 try{
  await extract(file,work)
  if(!existsSync(join(work,'manifest.json'))||!existsSync(join(work,'qinbian.sqlite')))fail(400,'备份缺少数据库或清单')
  const manifest=JSON.parse(readFileSync(join(work,'manifest.json'),'utf8'));if(manifest.format!=='qinbian-backup'||manifest.version!==1)fail(400,'不是可用的秦编备份')
  const test=new Database(join(work,'qinbian.sqlite'),{readonly:true})
  try{
   if(test.pragma('quick_check',{simple:true})!=='ok')fail(400,'备份数据库未通过完整性检查')
   for(const t of ['theme_sets','resources','documents','assets','versions','ai_jobs','settings','_migrations'])if(!test.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t))fail(400,'备份数据库结构不完整')
   for(const a of test.prepare('SELECT file_name FROM assets').all() as {file_name:string}[]){if(!/^[a-zA-Z0-9_.-]+$/.test(a.file_name)||!existsSync(join(work,'uploads',a.file_name)))fail(400,'备份缺少图片原文件')}
  }finally{test.close()}
  const previous=await makeBackup(store)
  store.restoring=true;store.sqlite.pragma('wal_checkpoint(TRUNCATE)');store.close()
  const db=resolve(store.config.dataDir,'qinbian.sqlite')
  for(const suffix of ['-wal','-shm'])if(existsSync(db+suffix))rmSync(db+suffix)
  copyFileSync(join(work,'qinbian.sqlite'),db)
  for(const folder of ['uploads','thumbs'])for(const name of readdirSync(join(work,folder)))copyFileSync(join(work,folder,name),resolve(store.config.dataDir,folder,name))
  store.open();await store.seed();store.restoring=false
  return {ok:true,previousBackup:previous.split('/').pop()}
 }catch(error){if(!store.sqlite.open)store.open();store.restoring=false;throw error}
 finally{rmSync(work,{recursive:true,force:true})}
}

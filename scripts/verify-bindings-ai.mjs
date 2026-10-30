import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.QINBIAN_API_URL||'http://127.0.0.1:3031'
async function req(path,body){const r=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const x=await r.json();if(!r.ok)throw new Error(x.message||`HTTP ${r.status}`);return x}
async function wait(j){let status='';for(let i=0;i<240;i++){j=await req('/api/ai/jobs/'+j.id);if(status!==j.status){status=j.status;console.log(j.operation,status)}if(j.status==='failed')throw new Error(j.error);if(j.status==='ready')return j;await new Promise(r=>setTimeout(r,1000))}throw new Error('等待超时')}
const report={date:new Date().toISOString(),palette:false,component:false,fields:false,mappings:false,paletteId:null,componentId:null,failures:[]}
try{
 const p=await wait(await req('/api/ai/jobs',{operation:'palette',colorCount:3,prompt:'生成一张三色中式书卷配色卡，三个颜色名称要有清晰的中文用途说明，气质温润、墨色和青色为主，强调与减淡档适合文字和底色。此为演示。',themeSetId:'shanhai',model:'deepseek-v4-pro'}))
 if(p.result.palette.colors.length!==3)throw new Error('配色数量不正确');report.palette=true
 const card=(await req('/api/ai/jobs/'+p.id+'/apply',{mode:'save',name:'书卷三色 · AI配色演示',themeSetId:'mine'})).value;report.paletteId=card.id
 const j=await wait(await req('/api/ai/jobs',{operation:'generate',colorCount:3,palette:card.data.palette,prompt:'生成一枚参数化演示组件：一个div文本框显示可修改字段title（文字，默认“书页里的小记”）；current字段为数字25，total字段为数字40，percent字段computed按current/total百分比计算；用percent显示进度和色条。必须声明fields。配色只用传入的三个颜色代号，标题宋体、正文黑体；标题文字放div里而非图片。不要任何真实活动或成绩信息。',themeSetId:'shanhai',model:'deepseek-v4-pro',referenceIds:['builtin-G04']}))
 report.component=true;report.fields=j.result.fields.some(f=>f.id==='current'&&f.type==='number')&&j.result.fields.some(f=>f.type==='computed')
 report.mappings=j.result.html.includes('data-qb-styles')
 const r=(await req('/api/ai/jobs/'+j.id+'/apply',{mode:'save',name:'参数与配色 · AI演示',themeSetId:'mine'})).value;report.componentId=r.id
 if(!report.fields||!report.mappings)throw new Error('生成内容缺少数值字段或颜色映射')
 console.log('真实配色卡与参数化组件验证通过')
}catch(e){report.failures.push(e.message);console.log('验证结果：'+e.message);process.exitCode=1}
mkdirSync('output/verification',{recursive:true});writeFileSync('output/verification/color-bindings-ai.json',JSON.stringify(report,null,2))

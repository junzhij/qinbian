import { mkdirSync, writeFileSync } from 'node:fs'
const base=process.env.QINBIAN_API_URL||'http://127.0.0.1:3031'
const request=async(path,body)=>{const r=await fetch(base+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const value=await r.json();if(!r.ok)throw new Error(value.message||`HTTP ${r.status}`);return value}
async function wait(job){let last='';for(let i=0;i<240;i++){job=await request('/api/ai/jobs/'+job.id);if(job.status!==last){console.log(job.operation,job.status);last=job.status}if(['ready','failed','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,1000))}throw new Error('验证等待超时')}
const report={date:new Date().toISOString(),model:'deepseek-v4-pro',generation:false,editing:false,applied:false,resourceId:null,failures:[]}
try{
 let j=await request('/api/ai/jobs',{operation:'generate',prompt:'制作一枚简洁的读书札记组件。只使用两段演示文案：标题“纸间小记”，正文“读一页书，留一行自己的思考。”。明确为演示，不含真实活动信息。白底、深海蓝标题、左侧灰青细线，无图片。',themeSetId:'shanhai',model:report.model,referenceIds:['builtin-C03']})
 j=await wait(j);if(j.status!=='ready')throw new Error(j.error||j.status);report.generation=true
 const saved=await request('/api/ai/jobs/'+j.id+'/apply',{mode:'save',themeSetId:'mine',name:'纸间小记 · AI演示'});let resource=saved.value;report.resourceId=resource.id
 j=await request('/api/ai/jobs',{operation:'edit',prompt:'保持正文文字和结构不变，只将左侧竖线颜色改为朱砂色 #9E4B3B。仍为演示组件。',themeSetId:'shanhai',model:report.model,targetType:'resource',targetId:resource.id,targetRevision:resource.revision,sourceHtml:resource.data.html,referenceIds:['builtin-C03']})
 j=await wait(j);if(j.status!=='ready')throw new Error(j.error||j.status);report.editing=true
 const applied=await request('/api/ai/jobs/'+j.id+'/apply',{mode:'replace',revision:resource.revision});report.applied=applied.value.revision===2
 console.log('真实生成与修改验证通过')
}catch(error){report.failures.push(error.message);console.log('真实验证结果：'+error.message);process.exitCode=1}
mkdirSync('output/verification',{recursive:true});writeFileSync('output/verification/deepseek.json',JSON.stringify(report,null,2))

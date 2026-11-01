import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { chartSchema, type ResolvedChart } from '@qinbian/shared'

const cache=new Map<string,Buffer>()
const escape=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function chartSvg(input:ResolvedChart){
 const chart=chartSchema.parse(input) as ResolvedChart,W=375,H=248,left=48,right=16,top=22,bottom=48,pw=W-left-right,ph=H-top-bottom
 const values=chart.series.flatMap(s=>s.values).filter((v):v is number=>v!==null),missing=!values.length||['pie','donut'].includes(chart.type)&&(values.length!==chart.labels.length||values.reduce((a,b)=>a+b,0)<=0)
 const text=(x:number,y:number,value:unknown,size=13,anchor='start',fill='#52636B')=>`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${escape(value)}</text>`
 const color=(i:number)=>chart.colors[i%chart.colors.length]!
 const fmt=(v:number)=>Math.abs(v)>=1e8?(v/1e8).toFixed(1)+'亿':Math.abs(v)>=10000?(v/10000).toFixed(1)+'万':Number(v.toFixed(2)).toString()
 let body=''
 if(missing)body=text(W/2,118,'请补全有效数据',13,'middle')
 else if(['pie','donut'].includes(chart.type)){
  const data=chart.series[0]!.values as number[],total=data.reduce((a,b)=>a+b,0),cx=113,cy=119,r=83
  const parts=data.map((v,i)=>({i,n:Math.floor(v/total*1000),fraction:v/total*1000%1})),remainder=1000-parts.reduce((s,p)=>s+p.n,0)
  for(const p of [...parts].sort((a,b)=>b.fraction-a.fraction).slice(0,remainder))p.n++
  let angle=-Math.PI/2
  data.forEach((v,i)=>{const next=angle+v/total*Math.PI*2,x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle),x2=cx+r*Math.cos(next),y2=cy+r*Math.sin(next);if(v/total>.999999)body+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color(i)}"/>`;else if(v>0)body+=`<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${v/total>.5?1:0} 1 ${x2} ${y2} Z" fill="${color(i)}" stroke="#fff" stroke-width="1.5"/>`;angle=next;const y=43+i*30;body+=`<rect x="215" y="${y-10}" width="9" height="9" rx="1" fill="${color(i)}"/>`+text(230,y,Array.from(chart.labels[i]!).slice(0,5).join(''),13)+text(359,y,parts[i]!.n/10+'%',13,'end')})
  if(chart.type==='donut')body=`<defs><mask id="donut-hole"><rect width="375" height="248" fill="white"/><circle cx="${cx}" cy="${cy}" r="48" fill="black"/></mask></defs><g mask="url(#donut-hole)">${body}</g>`+text(cx,cy-3,'合计',10,'middle')+text(cx,cy+17,fmt(total),16,'middle')
 }else{
  const min=Math.min(0,...values),max=Math.max(0,...values),span=max-min||1,low=min,high=max===min?min+1:max,y=(v:number)=>top+ph-(v-low)/(high-low)*ph,zero=y(0)
  if(chart.type==='horizontalBar'){
   const x=(v:number)=>left+(v-low)/(high-low)*pw,row=ph/chart.labels.length,bar=Math.min(22,row*.65/chart.series.length)
   for(let i=0;i<5;i++){const v=low+span*i/4,at=x(v);body+=`<path d="M ${at} ${top} V ${H-bottom}" stroke="#E5E9E8"/>`+text(at,H-bottom+20,fmt(v),13,'middle')}
   chart.labels.forEach((label,i)=>{const cy=top+row*(i+.5);body+=text(left-6,cy+3,Array.from(label).slice(0,3).join(''),13,'end');chart.series.forEach((s,j)=>{const v=s.values[i];if(v===null)return;const start=Math.min(x(0),x(v)),width=Math.abs(x(v)-x(0));body+=`<rect x="${start}" y="${cy-bar*chart.series.length/2+j*bar}" width="${width}" height="${Math.max(1,bar-2)}" fill="${color(j)}"/>`})})
  }else{
   for(let i=0;i<5;i++){const v=low+(high-low)*i/4,at=y(v);body+=`<path d="M ${left} ${at} H ${W-right}" stroke="#E5E9E8"/>`+text(left-7,at+3,fmt(v),13,'end')}
   const x=(i:number)=>chart.type==='bar'?left+pw*(i+.5)/chart.labels.length:chart.labels.length===1?left+pw/2:left+pw*i/(chart.labels.length-1)
   chart.labels.forEach((label,i)=>{const show=chart.labels.length<=7||i%Math.ceil(chart.labels.length/6)===0||i===chart.labels.length-1;if(show)body+=text(x(i),H-bottom+18,Array.from(label).slice(0,4).join(''),13,'middle')})
   chart.series.forEach((s,j)=>{
    if(chart.type==='bar'){const width=pw/chart.labels.length*.65/chart.series.length;s.values.forEach((v,i)=>{if(v===null)return;body+=`<rect x="${x(i)-width*chart.series.length/2+j*width}" y="${Math.min(zero,y(v))}" width="${Math.max(1,width-2)}" height="${Math.abs(y(v)-zero)}" fill="${color(j)}"/>`})}
    else{let segment:{x:number;y:number}[]=[];const flush=()=>{if(!segment.length)return;const d=segment.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');if(chart.type==='area')body+=`<path d="${d} L ${segment.at(-1)!.x} ${zero} L ${segment[0]!.x} ${zero} Z" fill="${color(j)}" opacity="0.14"/>`;body+=`<path d="${d}" fill="none" stroke="${color(j)}" stroke-width="2"${j===1?' stroke-dasharray="5 3"':j===2?' stroke-dasharray="2 3"':''}/>`;for(const p of segment)body+=`<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color(j)}" stroke="#fff" stroke-width="1"/>`;segment=[]};s.values.forEach((v,i)=>{if(v===null)flush();else segment.push({x:x(i),y:y(v)})});flush()}
   })
   body+=`<path d="M ${left} ${zero} H ${W-right}" stroke="#8D9B9B"/>`
  }
  chart.series.forEach((s,i)=>{body+=`<rect x="${left+i*100}" y="${H-12}" width="8" height="8" fill="${color(i)}"/>`+text(left+13+i*100,H-5,Array.from(s.name).slice(0,6).join(''),12)})
  if(chart.unit)body+=text(left,13,Array.from(chart.unit).slice(0,12).join(''),12)
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="496" viewBox="0 0 ${W} ${H}"><g font-family="PingFang SC,Microsoft YaHei,Noto Sans CJK SC,sans-serif">${body}</g></svg>`
}
export async function renderChart(chart:ResolvedChart){
 const key=createHash('sha256').update(JSON.stringify(chart)).digest('hex'),old=cache.get(key);if(old)return old
 const buffer=await sharp(Buffer.from(chartSvg(chart))).png().toBuffer();if(cache.size>=64)cache.delete(cache.keys().next().value!);cache.set(key,buffer);return buffer
}

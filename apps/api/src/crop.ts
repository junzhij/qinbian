import sharp from 'sharp'
import { centerCrop, cropInputSchema, type CropRect, type ImageSpec } from '@qinbian/shared'

export async function cropImage(input:Buffer,raw:unknown){
 const request=cropInputSchema.parse(raw),spec:ImageSpec={...request.spec}
 if(spec.shape==='circle')spec.ratio=1
 const meta=await sharp(input,{limitInputPixels:80_000_000}).metadata()
 const swap=!!meta.orientation&&meta.orientation>=5&&meta.orientation<=8
 const width=(swap?meta.height:meta.width)||0,height=(swap?meta.width:meta.pageHeight||meta.height)||0
 if(!width||!height)throw Object.assign(new Error('图片尺寸无法识别'),{statusCode:400})
 const rect:CropRect=request.rect||centerCrop(width,height,spec.ratio)
 const left=Math.min(width-1,Math.round(rect.x*width)),top=Math.min(height-1,Math.round(rect.y*height))
 const w=Math.max(1,Math.min(width-left,Math.round(rect.width*width))),h=Math.max(1,Math.min(height-top,Math.round(rect.height*height)))
 if(spec.ratio&&Math.abs(w/h-spec.ratio)>Math.max(.025,2/h))throw Object.assign(new Error('裁切比例与图片形状不一致，请重新调整'),{statusCode:400})
 const pages=meta.pages||1
 if(pages>200||width*height*pages>120_000_000)throw Object.assign(new Error('这张动图帧数或尺寸过大，请先缩小原图；原动画已保留'),{statusCode:413})
 const scale=Math.min(1,1600/Math.max(w,h),Math.sqrt(24_000_000/(w*h*pages))),outW=Math.max(1,Math.round(w*scale)),outH=Math.max(1,Math.round(h*scale))
 let mask:Buffer|undefined
 if(spec.shape!=='rect'){
  const shape=spec.shape==='circle'?`<ellipse cx="${outW/2}" cy="${outH/2}" rx="${outW/2}" ry="${outH/2}" fill="white"/>`:`<rect width="${outW}" height="${outH}" rx="${Math.min(outW,outH)*(spec.radius??.08)}" fill="white"/>`
  mask=Buffer.from(`<svg width="${outW}" height="${outH}" xmlns="http://www.w3.org/2000/svg">${shape}</svg>`)
 }
 const frames:Buffer[]=[]
 for(let page=0;page<pages;page++){
  let frame=sharp(input,{page,pages:1,limitInputPixels:80_000_000}).rotate().extract({left,top,width:w,height:h}).resize(outW,outH).ensureAlpha()
  if(mask)frame=frame.composite([{input:mask,blend:'dest-in'}])
  frames.push(await frame.raw().toBuffer())
 }
 const output=sharp(Buffer.concat(frames),{raw:{width:outW,height:outH*pages,channels:4,...(pages>1?{pageHeight:outH}:{})}})
 const buffer=pages>1?await output.gif({delay:meta.delay,loop:meta.loop,keepDuplicateFrames:true}).toBuffer():await output.png().toBuffer()
 return{buffer,spec,rect,extension:pages>1?'gif':'png'}
}

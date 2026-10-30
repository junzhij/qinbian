async (page) => {
  await page.getByRole('textbox',{name:'文章名称',exact:true}).waitFor({state:'visible'})
  const islands=page.locator('.canvas-island')
  const count=await islands.count()
  if(count!==96)throw new Error(`Expected 96 fixture components, found ${count}`)
  const report=[]
  const fields=['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','textAlign']
  for(let i=0;i<count;i++){
    const island=islands.nth(i)
    const candidate=await island.evaluate(root=>{
      const list=Array.from(root.querySelectorAll('p,h2,h3,h4,figcaption,td,th,li')).filter(n=>{
        if(!n.textContent.trim())return false
        const parent=n.closest('section')
        return !(parent?.firstElementChild?.tagName==='P'&&parent.firstElementChild.textContent.trim()==='＋')
      })
      const best=list.find(n=>/serif/i.test(n.style.fontFamily))||list.find(n=>parseFloat(n.style.fontSize)>=18)||list[0]
      if(!best)return null
      return {index:list.indexOf(best),selectorIndex:Array.from(root.querySelectorAll('p,h2,h3,h4,figcaption,td,th,li')).indexOf(best)}
    })
    if(!candidate){report.push({index:i,mediaOnly:true});continue}
    const before=await island.evaluate((root,index)=>{
      const el=root.querySelectorAll('p,h2,h3,h4,figcaption,td,th,li')[index]
      const s=getComputedStyle(el)
      return {html:root.innerHTML,text:root.textContent,structure:root.querySelectorAll('section,figure,table,img').length,styles:Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','textAlign'].map(k=>[k,s[k]]))}
    },candidate.selectorIndex)
    const targets=island.locator('p,h2,h3,h4,figcaption,td,th,li')
    if(await targets.count()<=candidate.selectorIndex)throw new Error('Paragraph locator changed')
    await targets.nth(candidate.selectorIndex).dblclick()
    const after=await island.evaluate(root=>{
      const el=root.querySelector('.inline-rich-editor p')
      if(!el)return null
      const s=getComputedStyle(el)
      return {text:root.textContent,structure:root.querySelectorAll('section,figure,table,img:not(.ProseMirror-separator)').length,editors:root.querySelectorAll('.inline-rich-editor').length,styles:Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','color','textAlign'].map(k=>[k,s[k]]))}
    })
    if(!after||after.editors!==1)throw new Error(`Component ${i}: editor missing after double click`)
    if(before.structure!==after.structure)throw new Error(`Component ${i}: outer component structure changed`)
    for(const f of fields)if(before.styles[f]!==after.styles[f])throw new Error(`Component ${i}: ${f} changed ${before.styles[f]} -> ${after.styles[f]}`)
    await page.getByRole('textbox',{name:'文章名称',exact:true}).click()
    await island.locator('.inline-rich-editor').waitFor({state:'detached'})
    const restored=await island.evaluate(root=>root.innerHTML)
    if(before.html!==restored)throw new Error(`Component ${i}: unchanged content was rewritten on blur`)
    report.push({index:i,unchanged:true})
  }
  return {tested:report.length,stylesPreserved:true,unchangedHtmlPreserved:true}
}

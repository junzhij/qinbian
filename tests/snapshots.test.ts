import {test} from 'node:test'
import assert from 'node:assert/strict'
import {cloneSnapshot} from '../packages/shared/src/snapshots.ts'

test('组件复制保留嵌套响应式配色与字段，副本互不影响',()=>{
 const palette=new Proxy({colors:[{id:'color1',name:'墨蓝',regular:'#183a49'}]}, {})
 const fields=new Proxy([{id:'title',label:'标题',default:'原文'}],{})
 const original={html:'<p>原文</p>',palette,fields,values:{title:'原文'}}
 const copy=cloneSnapshot(original)
 assert.deepEqual(copy,original)
 copy.palette.colors[0]!.name='副本颜色';copy.fields[0]!.label='副本标题';copy.values.title='副本文案'
 assert.equal(original.palette.colors[0]!.name,'墨蓝');assert.equal(original.fields[0]!.label,'标题');assert.equal(original.values.title,'原文')
})

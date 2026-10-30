import {test} from 'node:test'
import assert from 'node:assert/strict'
import {isAllowedOrigin} from '../apps/api/src/network.ts'
import {newBlockId} from '../packages/shared/src/ids.ts'

test('局域网模式只接受本机网卡地址及网页端口',()=>{
 const addresses=['192.168.9.109','172.20.10.4'],lan={lan:true,webPort:3030}
 assert.equal(isAllowedOrigin('http://192.168.9.109:3030',lan,addresses),true)
 assert.equal(isAllowedOrigin('http://172.20.10.4:3030',lan,addresses),true)
 assert.equal(isAllowedOrigin('http://192.168.9.109:3030',{...lan,lan:false},addresses),false)
 for(const origin of ['http://192.168.9.109:3031','http://192.168.9.110:3030','http://192.168.9.109.evil.example:3030','https://untrusted.example','null','http://192.168.9.109:3030/path'])assert.equal(isAllowedOrigin(origin,lan,addresses),false,origin)
 for(const origin of ['http://127.0.0.1:3030','http://localhost:3030','http://[::1]:3030'])assert.equal(isAllowedOrigin(origin,{lan:false,webPort:3030},addresses),true)
})
test('不提供randomUUID的HTTP浏览器仍能生成唯一的组件实例编号',()=>{
 const ids=Array.from({length:100},()=>newBlockId({getRandomValues:array=>globalThis.crypto.getRandomValues(array)}))
 assert.equal(new Set(ids).size,100)
 for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
 assert.equal(newBlockId({randomUUID:()=> 'native-id'}),'native-id')
})

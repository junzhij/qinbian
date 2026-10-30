type RandomSource={randomUUID?:()=>string;getRandomValues?:(array:Uint8Array)=>Uint8Array}

/** LAN HTTP does not expose crypto.randomUUID; getRandomValues remains available. */
export function newBlockId(crypto:RandomSource=globalThis.crypto):string {
 if(crypto?.randomUUID)return crypto.randomUUID()
 if(!crypto?.getRandomValues)throw new Error('浏览器不支持随机值生成，请使用较新的浏览器')
 const bytes=crypto.getRandomValues(new Uint8Array(16))
 bytes[6]=(bytes[6]!&15)|64;bytes[8]=(bytes[8]!&63)|128
 const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-')
}

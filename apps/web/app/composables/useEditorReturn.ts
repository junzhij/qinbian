export function useEditorReturn(fallback='/documents'){
 const route=useRoute()
 return computed(()=>{const value=route.query.returnTo;if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return fallback;try{const url=new URL(value,'http://qinbian.local');return url.origin==='http://qinbian.local'&&/^\/(?:documents(?:\/[a-zA-Z0-9_-]+)?|resources|settings)$/.test(url.pathname)?url.pathname+url.search:fallback}catch{return fallback}})
}

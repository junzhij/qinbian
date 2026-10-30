import { createApp } from './app.ts'
const {app,store}=await createApp()
await app.listen({host:'127.0.0.1',port:store.config.port})
console.log(`秦编本地服务已就绪：http://127.0.0.1:${store.config.port}`)
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit(0)))

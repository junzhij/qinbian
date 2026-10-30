import { config } from './config.ts'
import { Store } from './store.ts'
const store=new Store(config());await store.seed();store.close();console.log('数据库结构与内置资源已就绪。')

import { defineConfig } from 'tsup'
export default defineConfig({noExternal:['@qinbian/shared','parse5','entities'],external:['fastify','@fastify/multipart','better-sqlite3','drizzle-orm','sharp','yazl','yauzl','zod'],clean:true})

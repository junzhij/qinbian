export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  return proxyRequest(event, `${config.apiBase}${getRequestURL(event).pathname}${getRequestURL(event).search}`)
})

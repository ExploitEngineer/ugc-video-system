import { serve } from '@hono/node-server'
import { APP_NAME } from '@ugc/shared'
import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.text(`Hello from ${APP_NAME}!`)
})

const port = Number(process.env.PORT) || 3001

serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

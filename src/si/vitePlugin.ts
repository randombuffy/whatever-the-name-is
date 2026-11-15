import type { Plugin } from 'vite'
import { completeNim } from './nimServer'

type NodeReq = {
  method?: string
  on: (event: string, listener: (chunk?: unknown) => void) => void
}

type NodeRes = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

function readBody(req: NodeReq): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    req.on('data', (chunk) => chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk as Uint8Array)))
    req.on('end', () => resolve(chunks.join('')))
    req.on('error', () => reject(new Error('request body failed')))
  })
}

function send(res: NodeRes, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

export function nvidiaNimPlugin(apiKey: string | undefined): Plugin {
  const handle = async (req: NodeReq, res: NodeRes) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'POST only' })
      return
    }
    if (!apiKey) {
      send(res, 501, { error: 'NVIDIA_API_KEY is missing. Put it in .env and restart npm run dev.' })
      return
    }
    try {
      const body = JSON.parse((await readBody(req)) || '{}') as { note?: unknown; ask?: string }
      const advice = await completeNim(apiKey, body.note, String(body.ask ?? ''))
      send(res, 200, { advice, model: advice.model })
    } catch (error) {
      send(res, 502, { error: error instanceof Error ? error.message : 'NVIDIA NIM failed' })
    }
  }

  return {
    name: 'nvidia-nim',
    configureServer(server) {
      server.middlewares.use('/api/nim', (req, res) => {
        void handle(req as NodeReq, res as NodeRes)
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/nim', (req, res) => {
        void handle(req as NodeReq, res as NodeRes)
      })
    },
  }
}

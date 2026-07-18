import type { NextApiRequest, NextApiResponse } from 'next'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
} as const

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ ok: true })
}

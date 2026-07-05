import type { MetadataRoute } from 'next'

const basePath = process.env.DOCS_BASE_PATH ?? '/chat-adapter-zaileys'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'chat-adapter-zaileys — WhatsApp for Chat SDK',
    short_name: 'chat-adapter-zaileys',
    description:
      'WhatsApp adapter for Chat SDK powered by Zaileys — real history, native buttons, polls, and scheduling.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: `${basePath}/favicon/web-app-manifest-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/favicon/web-app-manifest-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${basePath}/favicon/web-app-manifest-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

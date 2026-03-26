import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MixStudio',
    short_name: 'MixStudio',
    description: 'Lecteur audio multipiste avec paroles synchronisées',
    start_url: '/projects',
    display: 'standalone',
    background_color: '#0a0a0f',
    theme_color: '#6366f1',
    orientation: 'portrait-primary',
    categories: ['music', 'entertainment'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    }
}

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Headers de sécurité sur toutes les routes
        source: '/(.*)',
        headers: [
          // Pas d'iframe tiers (clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Pas de sniffing de type MIME
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referer limité hors origine
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Capteurs non utilisés par l'app
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HTTPS forcé (sans effet en dev http, appliqué en prod)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
      {
        // Le SW doit toujours être vérifié côté serveur (pas de cache CDN/proxy)
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig

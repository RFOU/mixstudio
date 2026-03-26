/**
 * Génère les icônes PNG nécessaires à la PWA depuis le SVG source.
 * À exécuter une seule fois : node scripts/generate-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'public', 'icons', 'icon.svg')
const svgBuffer = readFileSync(svgPath)

const sizes = [
  { name: 'icon-192.png',        size: 192 },
  { name: 'icon-512.png',        size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const { name, size } of sizes) {
  const outPath = join(root, 'public', 'icons', name)
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outPath)
  console.log(`✓ ${name} (${size}x${size})`)
}

console.log('\nIcônes générées dans public/icons/')

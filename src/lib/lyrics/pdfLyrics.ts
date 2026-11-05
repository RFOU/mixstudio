/**
 * Extraction du texte d'un PDF de paroles → liste de lignes.
 *
 * Tourne 100 % dans le navigateur (pdf.js) : le PDF n'est jamais envoyé à un
 * serveur. On utilise le build « legacy » (compatible Safari plus anciens) et un
 * worker servi depuis /public (copié de node_modules/pdfjs-dist/legacy/build).
 *
 * pdf.js renvoie des fragments de texte positionnés (x, y), pas des lignes :
 * on regroupe les fragments qui partagent la même ordonnée, puis on trie de haut
 * en bas / de gauche à droite.
 */

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
}

/** Tolérance verticale (unités PDF) pour considérer deux fragments sur la même ligne. */
const SAME_LINE_TOLERANCE = 3

export async function extractLinesFromPdf(file: File): Promise<string[]> {
  // Import dynamique : pdf.js (~400 Ko) n'est chargé que si l'admin importe un PDF.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise

  const allLines: string[] = []
  let foundText = false

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const items = (content.items as unknown[]).filter(
        (it): it is PdfTextItem =>
          typeof it === 'object' && it !== null && 'str' in it && 'transform' in it
      )

      // Regroupe par ligne (même y, à la tolérance près).
      const rows: { y: number; items: PdfTextItem[] }[] = []
      for (const item of items) {
        if (!item.str.trim()) continue
        foundText = true
        const y = item.transform[5]
        const row = rows.find(r => Math.abs(r.y - y) <= SAME_LINE_TOLERANCE)
        if (row) row.items.push(item)
        else rows.push({ y, items: [item] })
      }

      // Haut de page d'abord (y PDF décroissant), puis gauche → droite.
      rows.sort((a, b) => b.y - a.y)
      for (const row of rows) {
        row.items.sort((a, b) => a.transform[4] - b.transform[4])
        let line = ''
        let prevEnd: number | null = null
        for (const it of row.items) {
          const x = it.transform[4]
          const fontSize = Math.abs(it.transform[0]) || 10
          // Espace seulement si un vrai vide sépare les fragments (sinon mot coupé).
          if (prevEnd !== null && x - prevEnd > fontSize * 0.15 && !line.endsWith(' ')) {
            line += ' '
          }
          line += it.str
          prevEnd = x + it.width
        }
        const clean = line.replace(/\s+/g, ' ').trim()
        // Ignore les numéros de page isolés.
        if (clean && !/^\d{1,3}$/.test(clean)) allLines.push(clean)
      }
    }
  } finally {
    await doc.destroy()
  }

  if (!foundText) {
    throw new Error(
      'Ce PDF ne contient pas de texte sélectionnable (probablement une image scannée). ' +
        'Utilisez « Coller du texte » à la place.'
    )
  }
  return allLines
}

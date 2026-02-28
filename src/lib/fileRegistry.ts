/**
 * Registry global pour stocker les références File natives.
 * Zustand/Immer ne peut pas sérialiser les objets File,
 * donc on les garde dans une Map externe.
 */
const fileRegistry = new Map<string, File>()

export function registerFile(trackId: string, file: File) {
  fileRegistry.set(trackId, file)
}

export function getFile(trackId: string): File | undefined {
  return fileRegistry.get(trackId)
}

export function removeFile(trackId: string) {
  fileRegistry.delete(trackId)
}

export function clearFiles() {
  fileRegistry.clear()
}

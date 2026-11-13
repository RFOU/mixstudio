'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, HardDrive, Trash2, Loader2, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import {
  clearAllOffline, formatBytes, getStorageReport, removeProjectOffline,
  requestPersistentStorage, type StorageReport,
} from '@/lib/offline/offlineManager'

export function StorageModal({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<StorageReport | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => setReport(await getStorageReport()), [])
  useEffect(() => { void refresh() }, [refresh])

  const handleRemove = async (projectId: string, name: string) => {
    if (!confirm(`Supprimer « ${name} » du stockage hors-ligne ?`)) return
    setBusy(projectId)
    await removeProjectOffline(projectId)
    await refresh()
    setBusy(null)
  }

  const handleClearAll = async () => {
    if (!confirm('Supprimer tous les fichiers audio stockés sur cet appareil ?')) return
    setBusy('all')
    await clearAllOffline()
    await refresh()
    setBusy(null)
    toast.success('Stockage vidé')
  }

  const handlePersist = async () => {
    const ok = await requestPersistentStorage()
    await refresh()
    if (ok) toast.success('Stockage protégé : le navigateur ne le videra pas automatiquement')
    else toast.info('Le navigateur n’a pas accordé la protection. Ajoutez l’app à l’écran d’accueil.')
  }

  const pct = report?.quota && report.usage != null
    ? Math.min(100, (report.usage / report.quota) * 100)
    : null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85%' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <HardDrive size={15} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Stockage hors-ligne</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="Fermer"><X size={16} /></Button>
        </div>

        <div className="overflow-y-auto px-4 py-3 flex flex-col gap-4">
          {!report ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          ) : (
            <>
              {/* Occupation */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Audio stocké</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {formatBytes(report.audioBytes)}
                  </span>
                </div>
                {pct !== null && report.quota && (
                  <>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: 'var(--accent)' }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {formatBytes(report.usage ?? 0)} utilisés sur ~{formatBytes(report.quota)} accordés à l’app
                    </p>
                  </>
                )}
              </div>

              {/* Protection contre l'effacement automatique */}
              {report.persisted ? (
                <div className="flex items-start gap-2 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(34,197,94,0.08)', color: '#22c55e' }}>
                  <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" />
                  Stockage protégé : le navigateur ne le supprimera pas automatiquement.
                </div>
              ) : (
                <div className="flex flex-col gap-2 text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                  <div className="flex items-start gap-2">
                    <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />
                    <span>
                      Sur iPhone, Safari peut effacer ces fichiers après environ 7 jours sans utilisation.
                      Pour les garder : <strong>Partager → Sur l’écran d’accueil</strong>, puis ouvrez l’app depuis l’icône.
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" className="self-start" onClick={handlePersist}>
                    Protéger le stockage
                  </Button>
                </div>
              )}

              {/* Par chanson */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                  Chansons
                </p>
                {report.projects.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                    Rien n’est stocké. Utilisez « Hors-ligne » sur une chanson pour la garder sur cet appareil.
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
                    {report.projects.map(p => (
                      <li key={p.projectId ?? 'unknown'} className="flex items-center gap-3 py-2" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{p.name}</p>
                          <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                            {formatBytes(p.bytes)} · {p.files} piste{p.files > 1 ? 's' : ''}
                            {p.pinned ? (
                              <span className="inline-flex items-center gap-0.5" style={{ color: '#22c55e' }}>
                                <CheckCircle2 size={10} /> hors-ligne
                              </span>
                            ) : (
                              <span title="Gardé automatiquement, peut être supprimé pour faire de la place">cache</span>
                            )}
                          </p>
                        </div>
                        {p.projectId && (
                          <Button
                            size="icon" variant="ghost" title="Supprimer de l’appareil"
                            disabled={busy !== null}
                            onClick={() => handleRemove(p.projectId as string, p.name)}
                          >
                            {busy === p.projectId ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {report && report.projects.length > 0 && (
          <div className="px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <Button size="sm" variant="danger" onClick={handleClearAll} disabled={busy !== null}>
              {busy === 'all' ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Trash2 size={12} className="mr-1" />}
              Tout vider
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

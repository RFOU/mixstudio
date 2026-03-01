'use client'

import { useState } from 'react'
import { AuthModal } from '@/components/AuthModal'
import {
  Music2, Play, Layers, Repeat, FileText, Wifi,
  ChevronRight, Headphones, Mic2, SlidersHorizontal,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Layers,
    title: 'Multipiste',
    desc: "Jusqu'à 16 pistes audio synchronisées. Mute, solo, volume et panoramique par piste.",
  },
  {
    icon: Repeat,
    title: 'Boucle précise',
    desc: 'Définissez vos zones de répétition au sample près. Entraînez-vous sur les passages difficiles.',
  },
  {
    icon: FileText,
    title: 'Paroles synchronisées',
    desc: 'Importez un fichier LRC ou SRT. Les paroles défilent en temps réel pendant la lecture.',
  },
  {
    icon: Wifi,
    title: 'Mode hors-ligne',
    desc: "Vos pistes sont mises en cache localement. L'app fonctionne sans connexion internet.",
  },
  {
    icon: SlidersHorizontal,
    title: 'Mixage en temps réel',
    desc: 'Ajustez les niveaux, la balance et les effets pendant la lecture sans interruption.',
  },
  {
    icon: Headphones,
    title: 'Haute qualité',
    desc: 'Moteur Web Audio API. Supporte MP3, WAV, FLAC, OGG jusqu\'à 300 MB par piste.',
  },
]

const USE_CASES = [
  { icon: Mic2, title: 'Musiciens', desc: 'Apprenez des morceaux en isolant chaque instrument.' },
  { icon: Music2, title: 'Professeurs', desc: 'Préparez vos cours avec des arrangements multipistes.' },
  { icon: Headphones, title: 'Producteurs', desc: 'Référencez vos mixes contre des morceaux existants.' },
]

export default function LandingPage() {
  const [showAuth, setShowAuth] = useState(false)

  return (
    <div style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--background)' }}>

      {/* NAV */}
      <nav
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <Music2 size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>MIXSTUDIO</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAuth(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            Connexion
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Commencer
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="flex flex-col items-center text-center px-6 pt-20 pb-16">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-6 border"
          style={{ background: 'var(--accent-dim)', borderColor: 'rgba(99,102,241,0.3)', color: 'var(--accent)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Player audio multipiste professionnel
        </div>

        <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-5 max-w-2xl" style={{ color: 'var(--text)' }}>
          Jouez, analysez,{' '}
          <span style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            maîtrisez
          </span>{' '}
          la musique
        </h1>

        <p className="text-base max-w-xl mb-8 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          MixStudio est un lecteur multipiste en ligne pour les musiciens, professeurs et producteurs.
          Importez vos pistes, isolez les instruments, synchronisez les paroles.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Créer un compte gratuit
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
          >
            <Play size={14} />
            Se connecter
          </button>
        </div>
      </section>

      {/* APP PREVIEW */}
      <section className="px-6 pb-16 flex justify-center">
        <div
          className="w-full max-w-4xl rounded-2xl overflow-hidden border"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}
        >
          {/* Fausse barre titre */}
          <div className="flex items-center gap-1.5 px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
            <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>MixStudio — Alicia Keys - If I Ain&apos;t Got You</span>
          </div>
          {/* Transport */}
          <div className="flex items-center gap-4 px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-7 h-7 rounded-lg" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
              <Play size={16} fill="white" color="white" />
            </div>
            <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>0:32 / 3:43</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
              <div className="h-full rounded-full w-1/4" style={{ background: 'var(--accent)' }} />
            </div>
          </div>
          {/* Pistes */}
          {[
            { name: 'Piano', color: '#6366f1' },
            { name: 'Voix', color: '#ec4899' },
            { name: 'Cordes', color: '#f59e0b' },
            { name: 'Basse', color: '#22c55e' },
          ].map((track) => (
            <div key={track.name} className="flex items-center border-b" style={{ borderColor: 'var(--border)', minHeight: 52 }}>
              <div className="w-1 self-stretch flex-shrink-0" style={{ background: track.color }} />
              <div className="px-3 py-2 flex-shrink-0 flex items-center gap-2" style={{ width: 160 }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{track.name}</span>
                <div className="ml-auto flex gap-1">
                  {['M', 'S'].map(l => (
                    <div key={l} className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>{l}</div>
                  ))}
                </div>
              </div>
              <div className="flex-1 px-2 py-3">
                <div className="h-8 rounded overflow-hidden relative" style={{ background: 'var(--surface-2)' }}>
                  <div className="absolute inset-0 flex items-center gap-px px-1">
                    {Array.from({ length: 80 }).map((_, i) => {
                      const seed = parseInt(track.color.slice(1, 3), 16)
                      const h = Math.abs(Math.sin(i * 0.4 + seed * 0.01)) * 0.7 + 0.15
                      const played = i / 80 < 0.25
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-sm"
                          style={{ height: `${h * 100}%`, background: played ? track.color : `${track.color}44` }}
                        />
                      )
                    })}
                  </div>
                  <div className="absolute top-0 bottom-0 w-px" style={{ left: '25%', background: 'white' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section className="px-6 py-16" style={{ background: 'var(--surface)' }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--text)' }}>
            Tout ce dont vous avez besoin
          </h2>
          <p className="text-sm text-center mb-10" style={{ color: 'var(--text-muted)' }}>
            Des outils professionnels dans une interface simple et rapide
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="p-5 rounded-xl border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: 'var(--accent-dim)' }}>
                  <f.icon size={18} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section className="px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-2" style={{ color: 'var(--text)' }}>
            Fait pour les professionnels
          </h2>
          <p className="text-sm text-center mb-10" style={{ color: 'var(--text-muted)' }}>
            Quelle que soit votre pratique musicale
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {USE_CASES.map((uc) => (
              <div key={uc.title} className="flex flex-col items-center text-center p-6 rounded-xl border"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: 'var(--accent-dim)' }}>
                  <uc.icon size={22} style={{ color: 'var(--accent)' }} />
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>{uc.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 flex flex-col items-center text-center" style={{ background: 'var(--surface)' }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'var(--accent-dim)' }}>
          <Music2 size={32} style={{ color: 'var(--accent)' }} />
        </div>
        <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text)' }}>Prêt à commencer ?</h2>
        <p className="text-sm mb-7 max-w-sm" style={{ color: 'var(--text-muted)' }}>
          Créez votre compte gratuitement et commencez à travailler sur vos morceaux en quelques secondes.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            Créer un compte gratuit <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setShowAuth(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <Play size={14} /> Se connecter
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-6 flex items-center justify-between border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5">
          <Music2 size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>MIXSTUDIO</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Player audio multipiste professionnel</span>
      </footer>

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} redirectTo="/projects" />}
    </div>
  )
}

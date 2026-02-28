# MixStudio

Player audio multipiste professionnel — Next.js + Supabase.

## Stack

- **Frontend** : Next.js 16 (App Router), React, TypeScript, Tailwind CSS
- **State** : Zustand + Immer
- **Audio** : Web Audio API (natif navigateur)
- **Backend** : Supabase (Auth, PostgreSQL, Storage)

## Features

- Import 2–16 pistes audio (MP3, WAV, FLAC, OGG — jusqu'à 300 MB/piste)
- Player multipiste synchronisé
- Waveform visuelle par piste
- Contrôle volume + panoramique par piste
- Mute / Solo par piste (fade-out 5ms sans clic audio)
- Boucle précise avec sélection IN/OUT par glisser-déposer (Shift+drag)
- Presets de boucle nommés
- Paroles synchronisées (LRC, SRT, TXT plain)
- Mode karaoké
- Décalage manuel des paroles (±5 000ms)
- Auth Supabase (email/password)
- Sauvegarde cloud des projets et pistes
- Raccourcis clavier
- Dark mode studio

## Configuration

### 1. Créer un projet Supabase

Rendez-vous sur [supabase.com](https://supabase.com) et créez un nouveau projet.

### 2. Initialiser la base de données

Dans **SQL Editor** de votre projet, exécutez le contenu du fichier `supabase/schema.sql`.

### 3. Créer le bucket de stockage

Dans **Storage**, créez un bucket nommé `audio-files` :
- Public : Non (privé)
- Les policies sont incluses dans le SQL

### 4. Variables d'environnement

Éditez `.env.local` avec vos clés (disponibles dans **Settings → API**) :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 5. Démarrer

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000

## Raccourcis clavier

| Touche | Action |
|--------|--------|
| `Espace` | Lecture / Pause |
| `S` | Stop |
| `R` / `Home` | Retour au début |
| `L` | Boucle on/off |
| `Shift + glisser` sur waveform | Sélectionner région de boucle |

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Page principale (Studio)
│   └── auth/callback/        # Callback OAuth
├── components/
│   ├── Studio.tsx            # Layout racine
│   ├── StudioHeader.tsx      # Barre de menu
│   ├── Transport.tsx         # Contrôles globaux
│   ├── MultitrackPanel.tsx   # Zone pistes
│   ├── TrackRow.tsx          # Une piste
│   ├── WaveformCanvas.tsx    # Canvas waveform
│   ├── LoopPanel.tsx         # Boucle + presets
│   ├── LyricsPanel.tsx       # Paroles
│   ├── AuthModal.tsx         # Auth
│   └── ProjectsModal.tsx     # Projets cloud
├── lib/
│   ├── audio/AudioEngine.ts  # Web Audio API
│   ├── lyrics/parseLyrics.ts # Parseur LRC/SRT
│   └── supabase/             # Clients Supabase
├── store/audioStore.ts       # Store Zustand
└── proxy.ts                  # Refresh session
```

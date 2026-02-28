'use client'

import dynamic from 'next/dynamic'

const ProjectsPage = dynamic(
  () => import('@/components/ProjectsPage').then(m => ({ default: m.ProjectsPage })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0f',
          color: '#6366f1',
          fontFamily: 'monospace',
          fontSize: 14,
          gap: 8,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 16,
            height: 16,
            border: '2px solid #6366f1',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        MixStudio
      </div>
    ),
  }
)

export default function Page() {
  return <ProjectsPage />
}

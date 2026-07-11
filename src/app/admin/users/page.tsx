'use client'

import dynamic from 'next/dynamic'

const AdminUsersPage = dynamic(
  () => import('@/components/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 'var(--vh-screen)',
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
        MixStudio Admin
      </div>
    ),
  }
)

export default function Page() {
  return <AdminUsersPage />
}

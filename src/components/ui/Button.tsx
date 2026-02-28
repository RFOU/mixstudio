import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'danger' | 'active' | 'icon'
  size?: 'sm' | 'md' | 'lg' | 'icon'
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-1 focus:ring-offset-[var(--background)] disabled:opacity-40 disabled:cursor-not-allowed select-none',
          {
            'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:scale-95': variant === 'default',
            'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)]': variant === 'ghost',
            'bg-[var(--danger)] text-white hover:opacity-80': variant === 'danger',
            'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)] hover:bg-[var(--accent)] hover:text-white': variant === 'active',
            'bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text)] rounded-md': variant === 'icon',
          },
          {
            'text-xs px-2 py-1 h-6': size === 'sm',
            'text-sm px-3 py-1.5 h-8': size === 'md',
            'text-base px-4 py-2 h-10': size === 'lg',
            'w-8 h-8 p-0': size === 'icon',
          },
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

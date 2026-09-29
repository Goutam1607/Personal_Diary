import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Visually hide the heading but keep it for screen readers */
  hideTitle?: boolean
  className?: string
}

/** Native <dialog>: focus trapping, Escape to close and inert background come for free. */
export function Dialog({ open, onClose, title, children, hideTitle, className = '' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      aria-labelledby={titleId}
      className={`dialog paper m-auto w-[min(92vw,30rem)] rounded-[1.6rem] p-0 text-ink backdrop:bg-[#2a2140]/35 backdrop:backdrop-blur-[3px] ${className}`}
    >
      {open && (
        <div className="p-6 sm:p-7">
          <h2 id={titleId} className={hideTitle ? 'sr-only' : 'font-display mb-3 text-xl font-semibold'}>
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  text: string
}

const ToastContext = createContext<(text: string) => void>(() => {})

/** Gentle, short-lived notes ("Saved 🤍"), also announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const next = useRef(0)

  const show = useCallback((text: string) => {
    const id = next.current++
    setToasts((t) => [...t.slice(-2), { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        {toasts.map((t) => (
          <div key={t.id} className="rise paper hand rounded-full px-5 py-2 text-xl">
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react'

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }

/** A textarea that grows with your words instead of scrolling inside a little box. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoTextarea({ minRows = 3, onInput, style, ...props }, ref) {
  const inner = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => inner.current!)

  const fit = useCallback(() => {
    const el = inner.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [])

  useEffect(fit, [props.value, fit])
  useEffect(() => {
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [fit])

  return (
    <textarea
      ref={inner}
      rows={minRows}
      onInput={(e) => {
        fit()
        onInput?.(e)
      }}
      style={{ resize: 'none', overflow: 'hidden', ...style }}
      {...props}
    />
  )
})

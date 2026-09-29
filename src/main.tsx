import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/nunito'
import '@fontsource-variable/caveat'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import './index.css'
import { App } from './App'

// Passkeys need a real hostname — they refuse IP addresses like 127.0.0.1. Hop over to localhost.
if (['127.0.0.1', '[::1]'].includes(window.location.hostname)) {
  window.location.replace(window.location.href.replace(window.location.hostname, 'localhost'))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

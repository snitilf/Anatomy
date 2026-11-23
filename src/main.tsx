// Must come first: it turns off the code generation of Zod before any schema loads. The Content Security Policy blocks `new Function`.
import './cli/jitless'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import { initTheme } from './theme/theme'
import App from './App.tsx'
import { preloadExamples } from './app/examples'
import { whenIdle } from './app/idle'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The map and the examples load on their own scripts. They are fetched after the first paint, so they never compete with
// it. Then a board opens at once, and an example opens even if the local server has stopped.
whenIdle(() => {
  void import('./canvas/Canvas').catch(() => undefined)
  preloadExamples()
})

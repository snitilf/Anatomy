import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import { initTheme } from './theme/theme'
import App from './App.tsx'
import { preloadExamples } from './app/examples'
import { whenIdle } from './app/idle'

initTheme()
// The map and the examples load on their own scripts. Fetching them once the page is idle keeps the first paint small,
// makes opening a board instant, and lets an example open even if the local server has stopped.
whenIdle(() => {
  void import('./canvas/Canvas').catch(() => undefined)
  preloadExamples()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

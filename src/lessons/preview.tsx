/**
 * Dev-only page that renders one lesson full width. It is not part of the production build.
 * Query options for checking the drawing: ?scheme=light or ?scheme=dark, and ?still=1 for reduced motion.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '../styles/tokens.css'
import { initTheme } from '../theme/theme'
import ApprovalGateLesson from './approval-gate/ApprovalGateLesson'

const params = new URLSearchParams(window.location.search)
const scheme = params.get('scheme')
const still = params.get('still') === '1'

if (scheme === 'light' || scheme === 'dark' || still) {
  const real = window.matchMedia.bind(window)
  const fake = (query: string, matches: boolean) =>
    ({ matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }) as MediaQueryList
  window.matchMedia = (query: string) => {
    if (scheme && query.includes('prefers-color-scheme: dark')) return fake(query, scheme === 'dark')
    if (still && query.includes('prefers-reduced-motion')) return fake(query, true)
    return real(query)
  }
}

initTheme()

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ApprovalGateLesson />
    </StrictMode>,
  )
}

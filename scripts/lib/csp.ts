import type { Plugin } from 'vite'

/**
 * The Content Security Policy of the built app.
 *
 * - The app makes no request after it loads, so `connect-src 'none'` stops any code from sending data out. Its own files (the lesson chunks and the `anatomy` tool) load as scripts from the same origin, and `connect-src` does not cover scripts.
 * - Scripts come from the same origin only: no inline script and no `eval`. The theme script is a file in the head for that reason.
 * - `style-src` keeps `'unsafe-inline'`. The toast library writes a style sheet at run time and the map writes style rules for the hover and for a selected bundle, so an inline style cannot be avoided. Under this policy a style cannot reach the network: `connect-src`, `img-src`, and `font-src` stop a url() in it from loading anything from another origin.
 * - `frame-ancestors` is left out on purpose. A browser ignores it in a meta tag.
 */
export const POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "connect-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

/** Puts the policy into the page as a meta tag. Only the build gets it: the dev server needs inline scripts of its own. */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'anatomy-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: POLICY }, injectTo: 'head-prepend' }],
    },
  }
}

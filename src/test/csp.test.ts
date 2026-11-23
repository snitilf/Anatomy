import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { POLICY, contentSecurityPolicy } from '../../scripts/lib/csp.ts'

const names = async (command: 'build' | 'serve', mode = 'production') => (await resolveConfig({ configFile: 'vite.config.ts' }, command, mode)).plugins.map((p) => p.name)

describe('the Content Security Policy', () => {
  it('goes into the build, and into the e2e build, and not into the dev server', async () => {
    expect(await names('build')).toContain('anatomy-csp')
    expect(await names('build', 'e2e')).toContain('anatomy-csp')
    expect(await names('serve', 'development')).not.toContain('anatomy-csp')
  })

  it('adds one meta tag to the head of the page', () => {
    const plugin = contentSecurityPolicy()
    const hook = plugin.transformIndexHtml as { handler: () => { tag: string; attrs: Record<string, string>; injectTo: string }[] }
    const tags = hook.handler()
    expect(tags).toEqual([{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: POLICY }, injectTo: 'head-prepend' }])
  })

  it('blocks the network, plugins, and frames of the page, and has no frame-ancestors', () => {
    expect(POLICY).toContain("connect-src 'none'")
    expect(POLICY).toContain("object-src 'none'")
    expect(POLICY).toContain("base-uri 'none'")
    expect(POLICY).toContain("form-action 'none'")
    expect(POLICY).toContain("script-src 'self'")
    expect(POLICY).not.toContain('frame-ancestors')
    expect(POLICY).not.toContain("'unsafe-eval'")
  })
})

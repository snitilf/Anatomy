/**
 * Where a request for the hosted copy lands in the build folder.
 * GitHub Pages serves a project page under `/<repository>/` and nothing at the site root, so a file the page asks for outside that
 * path is a miss there, and it must be a miss in the test server too.
 *
 * Returns the path of the file inside the build folder, or `undefined` when the url is outside `base` or tries to leave the folder.
 * `base` starts and ends with a slash, as Vite's `base` does.
 */
export function fileForUrl(base: string, rawUrl: string): string | undefined {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://host').pathname)
  } catch {
    return undefined
  }
  if (!pathname.startsWith(base)) return undefined
  const rest = pathname.slice(base.length)
  if (rest.startsWith('/') || rest.includes('\0') || rest.includes('\\')) return undefined
  if (rest.split('/').some((part) => part === '..')) return undefined
  return rest === '' || rest.endsWith('/') ? `${rest}index.html` : rest
}

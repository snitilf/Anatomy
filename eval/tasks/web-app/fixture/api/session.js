import { verifyCookie } from './crypto.js'

export function requireSession(req) {
  req.user = verifyCookie(req.cookies.session)
  if (!req.user) throw new Error('401')
}

// Sets the theme before the first paint. It is a file, not an inline script, because the Content Security Policy allows scripts from this origin only.
;(function () {
  var t = null
  try {
    t = localStorage.getItem('anatomy:theme')
  } catch {}
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
})()

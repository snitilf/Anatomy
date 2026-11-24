// Sets the theme before the first paint. It is a file, not an inline script, because the Content Security Policy allows scripts from this origin only.
;(function () {
  var t = null
  try {
    t = localStorage.getItem('anatomy:theme')
  } catch {}
  if (t !== 'light' && t !== 'dark') t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = t
  // The browser bar takes the theme of the page, not the system theme, when the two differ: every theme-color meta gets the color of the chosen theme.
  var metas = document.querySelectorAll('meta[name="theme-color"]')
  var own = null
  for (var i = 0; i < metas.length; i++) {
    // The color of each scheme is remembered, since the content is overwritten; the theme code reads it back.
    if (!metas[i].dataset.color) metas[i].dataset.color = metas[i].content
    if (metas[i].media.indexOf(t) !== -1) own = metas[i].dataset.color
  }
  if (own) for (var j = 0; j < metas.length; j++) metas[j].content = own
})()

const fs = require('node:fs')

console.log('## Performance results\n')
console.log('| Case | p95 (ms) | Max (ms) | Frame-time gate |')
console.log('| --- | ---: | ---: | --- |')

try {
  const report = JSON.parse(fs.readFileSync('performance-results.json', 'utf8'))
  let count = 0
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      // This interaction has no frame-time measurement.
      if (spec.title.includes('unselected card on a narrow screen')) continue
      for (const test of spec.tests) {
        const result = test.results.at(-1)
        const output = (result?.stdout ?? []).map((entry) => entry.text ?? '').join('')
        const match = output.match(/p95=([\d.]+)ms max=([\d.]+)ms slow=(\d+)/)
        const title = `${test.projectName}: ${spec.title}`.replaceAll('|', '\\|')
        if (!match) {
          console.log(`| ${title} | - | - | Not measured |`)
        } else {
          const [, p95, max, slow] = match
          const pass = Number(p95) <= 25 && Number(slow) <= 1 && (!spec.title.startsWith('dragging a card stays smooth') || Number(max) <= 180)
          console.log(`| ${title} | ${Number(p95).toFixed(2)} | ${Number(max).toFixed(2)} | ${pass ? 'Pass' : 'Fail'} |`)
        }
        count++
      }
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites ?? []) visit(suite)
  if (!count) console.log('| No timed cases found | - | - | Not measured |')
} catch (error) {
  console.log('| Results unavailable | - | - | Not measured |')
  console.log(`\nCould not read performance results: ${error.message}`)
}

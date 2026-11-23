const fs = require('node:fs')

const P95_MS = 25
const SLOW_ALLOWED = 1
const DRAG_MAX_MS = 180
/** The longest frame allowed after a resize release. Keep it equal to RELEASE_MS in e2e/performance.spec.ts. */
const RELEASE_MS = 50

/**
 * Reads the frame numbers a performance test printed. Two shapes exist:
 * `frames=N p50=Xms p95=Xms max=Xms slow=N` for gestures, and `frames=N max=Xms` for a resize release.
 */
function parseMeasure(text) {
  for (const line of text.split('\n')) {
    const max = line.match(/\bmax=([\d.]+)ms/)
    if (!max) continue
    const frames = line.match(/\bframes=(\d+)/)
    const p95 = line.match(/\bp95=([\d.]+)ms/)
    const slow = line.match(/\bslow=(\d+)/)
    return {
      ...(frames ? { frames: Number(frames[1]) } : {}),
      ...(p95 ? { p95: Number(p95[1]) } : {}),
      max: Number(max[1]),
      ...(slow ? { slow: Number(slow[1]) } : {}),
    }
  }
  return undefined
}

function judge(title, m) {
  if (m.p95 === undefined) return m.max < RELEASE_MS ? 'Pass' : 'Fail'
  const dragOk = !title.includes('dragging a card stays smooth') || m.max <= DRAG_MAX_MS
  return m.p95 <= P95_MS && (m.slow ?? 0) <= SLOW_ALLOWED && dragOk ? 'Pass' : 'Fail'
}

function tableRow(title, text) {
  const cell = title.replaceAll('|', '\\|')
  const m = parseMeasure(text)
  if (!m) return `| ${cell} | - | - | Not measured |`
  const p95 = m.p95 === undefined ? '-' : m.p95.toFixed(2)
  return `| ${cell} | ${p95} | ${m.max.toFixed(2)} | ${judge(title, m)} |`
}

function main() {
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
          console.log(tableRow(`${test.projectName}: ${spec.title}`, output))
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
}

if (require.main === module) main()
module.exports = { parseMeasure, tableRow }

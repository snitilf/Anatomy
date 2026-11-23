import { expect, test, type Page } from '@playwright/test'

const EXAMPLES = [
  { name: /How the Claude Code harness works/, title: 'How the Claude Code harness works' },
  { name: /Anatomy itself/, title: 'Anatomy: how a board becomes a map' },
  { name: /How a large language model like Opus 5.5 works/, title: 'How a large language model like Opus 5.5 works' },
]

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' })

test.describe('the examples load when the user opens one', () => {
  for (const example of EXAMPLES) {
    test(`opens ${example.title} from the start screen`, async ({ page }) => {
      await page.goto('/')
      await page.getByRole('button', { name: example.name }).click()
      await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
      await expect(sidebar(page).getByRole('heading', { level: 2, name: example.title })).toBeVisible()
    })

    test(`opens ${example.title} with the network gone, because the boards load while the page is idle`, async ({ page, context }) => {
      await page.goto('/')
      await expect(page.getByRole('button', { name: example.name })).toBeVisible()
      // The page fetches the map and the three boards after its first paint. Go offline only when all four have arrived.
      await expect
        .poll(() =>
          page.evaluate(() => {
            const done = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.responseEnd > 0).map((e) => e.name)
            return [/\/Canvas-[^/]*\.js$/, /\/anatomy\.board-[^/]*\.js$/, /\/claude-code-harness\.board-[^/]*\.js$/, /\/how-an-llm-works\.board-[^/]*\.js$/].every((re) => done.some((n) => re.test(n)))
          }),
        )
        .toBe(true)
      await context.setOffline(true)
      await page.getByRole('button', { name: example.name }).click()
      await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
      await expect(sidebar(page).getByRole('heading', { level: 2, name: example.title })).toBeVisible()
    })
  }

  test('says so when a board cannot load, and stays on the start screen', async ({ page }) => {
    await page.route(/\/assets\/[^/]*board[^/]*\.js$/, (route) => route.abort())
    await page.goto('/')
    await page.getByRole('button', { name: EXAMPLES[0]!.name }).click()
    await expect(page.getByText(/could not load that example/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Open a repository to see its anatomy.' })).toBeVisible()
  })
})

/// <reference lib="dom" />
import { expect, test } from './test.ts'
import type { Locator, Page } from '@playwright/test'
import { open } from './helpers.ts'
import { everyState, seedFolder } from './states.ts'

/*
 * The control foundation (step 7b): one button system with four variants and three sizes, one segmented control, and the
 * shared rules for press, focus, and a coarse pointer. Geometry is read from the page as drawn, by role and text, never by class.
 *
 * The scenes below hold only the surfaces that step 7b adopts: the start screen, the Send popover, the Open menu, the walkthrough
 * bar, and the note field's switch. Everything else on a scene is listed in LATER, each entry with the slice that adopts it.
 */

const REFUND = 'e2e/fixtures/refund-approval.board.json'
const AT = '2026-11-14T00:00:00.000Z'
/** The heights of a button with a fine pointer: small, default, large. */
const HEIGHTS = [24, 28, 32]

interface Probe {
  name: string
  height: number
  width: number
  /** The area that answers a press: the box, grown by the invisible hit area around it. */
  hitHeight: number
  hitWidth: number
  /** A label or a pill drawn on the map itself, such as "Zoom to this group". It sizes to the map, not to a control. */
  onMap: boolean
  card: boolean
  where: string
  /** The labelled section of a list the button sits in, such as the examples of the Open menu. */
  list: string
}

/** Every button on the page, as drawn: its box, its hit area, and where it sits. */
const probe = (scope: Page | Locator): Promise<Probe[]> =>
  scope.getByRole('button').evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect()
      const after = getComputedStyle(el, '::after')
      const grown = (side: 'height' | 'width') => {
        const value = parseFloat(after[side])
        return Number.isFinite(value) && after.position === 'absolute' ? value : 0
      }
      const region = el.closest('[data-testid], [role="region"], [role="dialog"], [role="navigation"], [role="toolbar"], header, aside')
      return {
        name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 48),
        height: Math.round(box.height * 10) / 10,
        width: Math.round(box.width * 10) / 10,
        hitHeight: Math.max(box.height, grown('height')),
        hitWidth: Math.max(box.width, grown('width')),
        // An example card is a button that holds a map preview. It is a card, not a control.
        card: el.querySelector('[data-testid^="example-preview-"]') !== null,
        onMap: el.closest('.react-flow__viewport') !== null,
        list: el.closest('section[aria-labelledby]')?.getAttribute('aria-labelledby') ?? '',
        where: region?.getAttribute('data-testid') ?? region?.getAttribute('aria-label') ?? region?.tagName.toLowerCase() ?? '',
      }
    }),
  )

/*
 * Buttons that do not follow the sizes yet. Each belongs to the slice that adopts the shared classes there, and that
 * slice deletes its entry. Nothing here is a size the foundation allows: an entry only says "not yet".
 */
const LATER: { slice: string; reason: string; match: (p: Probe) => boolean }[] = [
  { slice: '7f', reason: 'the example rows of the Open menu are two-line rows of their own sheet', match: (p) => p.list === 'open-examples' },
  { slice: '7f', reason: 'the canvas toolbars read their height from the control token in the sweep', match: (p) => p.where === 'Whiteboard tools' && p.name === 'More shapes' },
]

const later = (p: Probe) => LATER.some((entry) => entry.match(p))
const controls = (all: Probe[]) => all.filter((p) => !p.card && !p.onMap && !later(p))
const label = (p: Probe) => `${p.where}: ${p.name} (${p.height} x ${p.width})`

async function expectSizes(scope: Page | Locator) {
  const bad = controls(await probe(scope)).filter((p) => !HEIGHTS.includes(p.height))
  expect(bad.map(label)).toEqual([])
}

async function expectHitAreas(page: Page, scope: Page | Locator = page) {
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
  const small = controls(await probe(scope)).filter((p) => p.hitHeight < 44 || p.hitWidth < 44)
  expect(small.map((p) => `${p.where}: ${p.name} (${p.hitHeight} x ${p.hitWidth})`)).toEqual([])
}

/** The paint of a button that a press changes. */
const look = (button: Locator) =>
  button.evaluate((el) => {
    const style = getComputedStyle(el)
    return { background: style.backgroundColor, transform: style.transform, color: style.color }
  })

/** Hovers a button, waits for the hover to settle, then holds the mouse down on it. The press is read before release and then cancelled. */
async function press(page: Page, button: Locator) {
  const box = (await button.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(250)
  const rest = await look(button)
  await page.mouse.down()
  const held = await look(button)
  // Releasing away from the button cancels the click, so the press changes nothing else on the page.
  await page.mouse.move(box.x + box.width + 40, box.y + box.height + 40)
  await page.mouse.up()
  return { rest, held }
}

/** Tabs until the button has focus. */
async function tabTo(page: Page, button: Locator, limit = 60) {
  for (let i = 0; i < limit; i++) {
    if (await button.evaluate((el) => el === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('Tab never reached the button')
}

/** The focus ring is a box shadow in the focus color. */
const ring = (button: Locator) => button.evaluate((el) => getComputedStyle(el).boxShadow)

/** A popover opens with a short scale. Its buttons are measured once it has come to rest. */
const settled = (panel: Locator) => expect(panel).toHaveCSS('transform', 'none')

const sendButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Send to agent/ })
const popover = (page: Page) => page.getByRole('dialog', { name: 'Send to agent' })

/** The shortener with a note to send and one drawing that has no note, which the popover leaves out. */
async function openWithItems(page: Page) {
  const { text, layer } = await everyState()
  const own = layer as unknown as Record<string, unknown>
  own.sent = undefined
  own.answers = []
  own.notes = [{ id: 'note-first0001', kind: 'note', text: 'A note to send', target: { type: 'board' }, targetFingerprint: 'x', createdAt: AT, updatedAt: AT }]
  own.marks = [{ id: 'mark-skip00001', kind: 'rect', x: 4200, y: 4200, width: 120, height: 80, createdAt: AT }]
  await seedFolder(page, text, own)
  await page.goto('/')
  await page.getByRole('button', { name: 'Open folder' }).click()
  await expect(page.getByRole('banner').getByRole('button', { name: /^Send/ })).toBeVisible()
  await toMap(page)
}

/** A crowded or narrow window opens on the Overview. These tests are about the map, so they go there. */
async function toMap(page: Page) {
  await expect(page.getByRole('tab', { name: 'Map' }).or(page.getByRole('region', { name: 'Sidebar' })).first()).toBeVisible()
  await page.waitForTimeout(300)
  const tab = page.getByRole('tab', { name: 'Map' })
  if (await page.getByTestId('overview').isVisible()) await tab.click()
  await expect(page.locator('.react-flow__node-card').first()).toBeVisible()
}

async function startWalkthrough(page: Page) {
  await page.keyboard.press('ControlOrMeta+k')
  const menu = page.getByRole('dialog', { name: 'Command menu' })
  await menu.getByRole('combobox').fill('Play Approve and pay')
  await page.keyboard.press('Enter')
  const bar = page.getByRole('region', { name: 'Walkthrough: Approve and pay' })
  await expect(bar).toBeVisible()
  return bar
}

test.describe('with a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the start screen: Open folder is a large primary button and Open file a large default one', async ({ page }) => {
    await page.goto('/')
    const folder = page.getByRole('button', { name: 'Open folder' })
    const file = page.getByRole('button', { name: 'Open file' })
    await expect(folder).toBeVisible()
    expect((await folder.boundingBox())!.height).toBe(32)
    expect((await file.boundingBox())!.height).toBe(32)
    // The primary one fills with the accent. The other keeps a hairline on the raised fill.
    const accent = await page.evaluate(() => {
      const probe = document.createElement('i')
      probe.style.background = getComputedStyle(document.documentElement).getPropertyValue('--accent')
      document.body.append(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    expect((await look(folder)).background).toBe(accent)
    expect((await look(file)).background).not.toBe(accent)
    await expectSizes(page)
  })

  test('the map: every control is 24, 28, or 32 high', async ({ page }) => {
    await open(page, REFUND)
    await expectSizes(page)
    await page.getByRole('button', { name: 'Search' }).click()
    await page.keyboard.press('Escape')
  })

  test('the Send popover: the main action is large and primary, and a quiet line has no dead control', async ({ page }) => {
    await openWithItems(page)
    await sendButton(page).click()
    const panel = popover(page)
    await expect(panel).toBeVisible()
    await settled(panel)
    const main = panel.getByRole('button', { name: 'Send', exact: true })
    expect((await main.boundingBox())!.height).toBe(32)
    await expectSizes(panel)
    // Nothing is left to send after the press, and the result reads as a result.
    await main.click()
    await expect(panel.getByRole('status')).toContainText(/Sent \d+ items?/)
    await settled(panel)
    await expectSizes(panel)
  })

  test('the Send popover with nothing new', async ({ page }) => {
    await open(page, REFUND)
    await sendButton(page).click()
    await expect(popover(page).getByText('Nothing new to send.')).toBeVisible()
    await settled(popover(page))
    await expectSizes(popover(page))
  })

  test('the Open menu: its rows are 32 high, and a saved board has small buttons', async ({ page }) => {
    await open(page, REFUND)
    // A board opened from a file is kept in this browser, so the menu lists it.
    await page.waitForTimeout(800)
    await page.getByRole('banner').getByRole('button', { name: /Local file/ }).click()
    const menu = page.getByRole('dialog', { name: 'Open' })
    await expect(menu).toBeVisible()
    await settled(menu)
    for (const name of [/^Open folder/, /^Open file/]) {
      const row = menu.getByRole('button', { name })
      if (await row.count()) expect((await row.boundingBox())!.height).toBe(32)
    }
    const saved = menu.getByRole('button', { name: /^Open Refund approval/ })
    if (await saved.count()) {
      expect((await saved.boundingBox())!.height).toBe(24)
      expect((await menu.getByRole('button', { name: /^Delete Refund approval/ }).boundingBox())!.height).toBe(24)
    }
    await expectSizes(menu)
  })

  test('the walkthrough bar: Previous and Close are small icon buttons, Next is a small primary button, and the last step says Done', async ({ page }) => {
    await open(page, REFUND)
    const bar = await startWalkthrough(page)
    const next = bar.getByRole('button', { name: 'Next' })
    await expect(next).toHaveText('Next')
    expect((await next.boundingBox())!.height).toBe(24)
    for (const name of ['Previous', 'Close']) {
      const box = (await bar.getByRole('button', { name }).boundingBox())!
      expect([box.height, box.width]).toEqual([24, 24])
    }
    await expectSizes(page)
    // Next is the labelled one and takes the focus, so Enter walks on.
    await expect(next).toBeFocused()
    for (let i = 0; i < 8 && (await bar.getByRole('button', { name: 'Next' }).count()); i++) await page.keyboard.press('Enter')
    const done = bar.getByRole('button', { name: 'Done' })
    await expect(done).toBeVisible()
    await expect(done).toBeFocused()
    expect((await done.boundingBox())!.height).toBe(24)
    await expectSizes(page)
    await page.keyboard.press('Enter')
    await expect(bar).toBeHidden()
  })

  test('the note field: Note and Question are one segmented choice, 24 high, with the checked one raised', async ({ page }) => {
    await open(page, REFUND)
    await page.keyboard.press('c')
    const field = page.getByRole('textbox', { name: 'Add a note' })
    await expect(field).toBeFocused()
    const group = page.getByRole('radiogroup', { name: 'Kind' })
    await expect(group).toBeVisible()
    expect((await group.boundingBox())!.height).toBe(24)
    const note = group.getByRole('radio', { name: 'Note' })
    const question = group.getByRole('radio', { name: 'Question' })
    await expect(note).toHaveAttribute('aria-checked', 'true')
    const raised = await look(note)
    expect((await look(question)).background).not.toBe(raised.background)
    // The thumb has a hairline, and the unchecked segment has none. Both keep a 1px border, so the text does not move.
    const border = (el: Element) => ({ width: getComputedStyle(el).borderTopWidth, color: getComputedStyle(el).borderTopColor })
    const thumb = await note.evaluate(border)
    const bare = await question.evaluate(border)
    expect(thumb.width).toBe('1px')
    expect(bare.width).toBe('1px')
    expect(thumb.color).not.toBe('rgba(0, 0, 0, 0)')
    expect(bare.color).toBe('rgba(0, 0, 0, 0)')
    // One tab stop for the group, and the arrow keys move inside it and take the choice along.
    await page.keyboard.press('Tab')
    await expect(note).toBeFocused()
    expect(await ring(note)).not.toBe('none')
    await page.keyboard.press('ArrowRight')
    await expect(question).toBeFocused()
    await expect(question).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('textbox', { name: 'Add a question' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(note).toBeChecked()
  })

  test('an open menu holds its trigger on the open fill while the pointer is still over it', async ({ page }) => {
    await open(page, REFUND)
    const trigger = page.getByRole('banner').getByRole('button', { name: 'Settings' })
    const box = (await trigger.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(trigger).toHaveAttribute('data-popup-open', '')
    await page.waitForTimeout(250)
    const over = await look(trigger)
    // Away from the trigger, the menu stays open and the trigger shows the open fill alone.
    await page.mouse.move(box.x - 300, box.y + 400)
    await page.waitForTimeout(250)
    await expect(page.getByRole('menu')).toBeVisible()
    const away = await look(trigger)
    expect(over.background).toBe(away.background)
    expect(over.color).toBe(away.color)
    await page.keyboard.press('Escape')
  })

  test('a press answers at once: the primary, default, quiet, and link variants each change on the way down', async ({ page }) => {
    await page.goto('/')
    // Primary and default: the start screen.
    const primary = await press(page, page.getByRole('button', { name: 'Open folder' }))
    expect(primary.held.background).not.toBe(primary.rest.background)
    expect(primary.held.transform).not.toBe('none')
    expect(primary.held.transform).not.toBe(primary.rest.transform)
    const secondary = await press(page, page.getByRole('button', { name: 'Open file' }))
    expect(secondary.held.background).not.toBe(secondary.rest.background)
    expect(secondary.held.transform).not.toBe(secondary.rest.transform)
  })

  test('a press on the quiet variant changes its fill and does not scale it', async ({ page }) => {
    await open(page, REFUND)
    const bar = await startWalkthrough(page)
    const { rest, held } = await press(page, bar.getByRole('button', { name: 'Close' }))
    expect(held.background).not.toBe(rest.background)
    expect(held.transform).toBe('none')
  })

  test('a press on the link variant changes its color', async ({ page }) => {
    await openWithItems(page)
    await sendButton(page).click()
    await settled(popover(page))
    const link = popover(page).getByRole('button', { name: 'Show', exact: true })
    await expect(link).toBeVisible()
    expect((await link.boundingBox())!.height).toBe(24)
    // At rest it is underlined, so it reads as an action without hover or color.
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline')
    expect(await link.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
    const { rest, held } = await press(page, link)
    expect(held.color).not.toBe(rest.color)
  })

  test('Tab reaches the primary and default variants and shows the ring', async ({ page }) => {
    await page.goto('/')
    for (const name of ['Open folder', 'Open file']) {
      const button = page.getByRole('button', { name })
      await tabTo(page, button)
      expect(await ring(button), `${name} has no ring`).not.toBe('none')
      expect(await ring(button)).toContain('rgba(')
    }
  })

  test('Tab reaches the quiet variant and shows the ring', async ({ page }) => {
    await open(page, REFUND)
    const bar = await startWalkthrough(page)
    const close = bar.getByRole('button', { name: 'Close' })
    await tabTo(page, close)
    expect(await ring(close)).toContain('rgba(')
  })

  test('Tab reaches the link variant and shows the ring', async ({ page }) => {
    await openWithItems(page)
    await sendButton(page).click()
    const link = popover(page).getByRole('button', { name: 'Show', exact: true })
    await link.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    expect(await ring(link)).not.toBe('none')
  })

  test('a disabled button is dimmed and shows no pointer, and an off step button takes no press', async ({ page }) => {
    await open(page, REFUND)
    await page.keyboard.press('c')
    await expect(page.getByRole('textbox', { name: 'Add a note' })).toBeFocused()
    // With nothing written Add is off.
    const add = page.getByRole('button', { name: /^Add/ })
    await expect(add).toBeDisabled()
    expect(await add.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5')
    expect(await add.evaluate((el) => getComputedStyle(el).cursor)).toBe('default')
    await page.keyboard.press('Escape')
    // Previous is off on the first step. It keeps focus rules, so it is aria-disabled, and it answers no press and no hover.
    const bar = await startWalkthrough(page)
    const previous = bar.getByRole('button', { name: 'Previous' })
    await expect(previous).toHaveAttribute('aria-disabled', 'true')
    expect(await previous.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5')
    const { rest, held } = await press(page, previous)
    expect(held.transform).toBe(rest.transform)
    expect(held.background).toBe(rest.background)
  })
})

test.describe('with reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })

  test('a press does not scale, and still changes the fill', async ({ page }) => {
    await page.goto('/')
    for (const name of ['Open folder', 'Open file']) {
      const { rest, held } = await press(page, page.getByRole('button', { name }))
      expect(held.transform, `${name} scaled`).toBe('none')
      expect(held.background).not.toBe(rest.background)
    }
  })

  test('the walkthrough bar is at rest at once, and Done still closes it', async ({ page }) => {
    await open(page, REFUND)
    const bar = await startWalkthrough(page)
    await expect(bar).toHaveCSS('opacity', '1')
    for (let i = 0; i < 8 && (await bar.getByRole('button', { name: 'Next' }).count()); i++) await bar.getByRole('button', { name: 'Next' }).click()
    await bar.getByRole('button', { name: 'Done' }).click()
    await expect(bar).toBeHidden()
  })
})

test.describe('with a coarse pointer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the start screen: every hit area is at least 44 px', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Open folder' })).toBeVisible()
    await expectHitAreas(page)
    // The large button is as tall as the hit area itself.
    expect((await page.getByRole('button', { name: 'Open file' }).boundingBox())!.height).toBe(44)
  })

  test('the map: every hit area is at least 44 px', async ({ page }) => {
    await open(page, REFUND)
    await expectHitAreas(page)
  })

  test('a playing walkthrough: every hit area is at least 44 px', async ({ page }) => {
    await open(page, REFUND)
    await startWalkthrough(page)
    await expectHitAreas(page)
  })
})

test.describe('with a coarse pointer on a wide window', () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true })

  test('the Send popover and the Open menu: every hit area is at least 44 px', async ({ page }) => {
    await openWithItems(page)
    await sendButton(page).click()
    await expect(popover(page)).toBeVisible()
    await settled(popover(page))
    await expectHitAreas(page, popover(page))
    await page.keyboard.press('Escape')
    await page.getByRole('banner').getByRole('button', { name: 'states', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Open' })).toBeVisible()
    await settled(page.getByRole('dialog', { name: 'Open' }))
    await expectHitAreas(page, page.getByRole('dialog', { name: 'Open' }))
  })

  test('the note field switch: each segment answers a press in a 44 px area', async ({ page }) => {
    await open(page, REFUND)
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await page.keyboard.press('c')
    const group = page.getByRole('radiogroup', { name: 'Kind' })
    await expect(group).toBeVisible()
    for (const name of ['Note', 'Question']) {
      const hit = await group.getByRole('radio', { name }).evaluate((el) => {
        const box = el.getBoundingClientRect()
        const after = getComputedStyle(el, '::after')
        const grown = (side: 'height' | 'width') => {
          const value = parseFloat(after[side])
          return Number.isFinite(value) ? value : 0
        }
        return { height: Math.max(box.height, grown('height')), width: Math.max(box.width, grown('width')) }
      })
      expect(hit.height, `${name} hit height`).toBeGreaterThanOrEqual(44)
      expect(hit.width, `${name} hit width`).toBeGreaterThanOrEqual(44)
    }
  })
})

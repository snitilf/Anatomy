import { priceOrder, type Order } from '@shop/shared'

export async function checkout(items: Order['items'], prices: Record<string, number>) {
  const preview = priceOrder(items, prices)
  const res = await fetch('/api/orders', { method: 'POST', body: JSON.stringify({ items }) })
  return { preview, order: (await res.json()) as Order }
}

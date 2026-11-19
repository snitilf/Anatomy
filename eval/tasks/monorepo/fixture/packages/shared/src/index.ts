export type Order = { id: string; items: { sku: string; qty: number }[]; total: number }
export function priceOrder(items: Order['items'], prices: Record<string, number>): number {
  return items.reduce((sum, i) => sum + (prices[i.sku] ?? 0) * i.qty, 0)
}

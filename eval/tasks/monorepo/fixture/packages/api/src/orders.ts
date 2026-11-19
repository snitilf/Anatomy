import { priceOrder, type Order } from '@shop/shared'
import { saveOrder, loadPrices } from './db.ts'
import { enqueue } from './queue.ts'

export async function createOrder(items: Order['items']): Promise<Order> {
  const total = priceOrder(items, await loadPrices())
  const order = await saveOrder({ items, total })
  await enqueue('order-email', { orderId: order.id })
  return order
}

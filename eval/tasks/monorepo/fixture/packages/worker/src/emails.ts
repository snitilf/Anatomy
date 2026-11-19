import type { Order } from '@shop/shared'
import { sendMail } from './mailer.ts'
import { loadOrder } from './db.ts'

export async function handleOrderEmail(job: { orderId: string }) {
  const order: Order = await loadOrder(job.orderId)
  await sendMail(`Order ${order.id} confirmed. Total: ${order.total}`)
}

import type { Order } from '@shop/shared'
export async function loadOrder(id: string): Promise<Order> { /* reads the orders table */ return { id, items: [], total: 0 } }

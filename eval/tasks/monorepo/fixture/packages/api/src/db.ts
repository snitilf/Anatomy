import type { Order } from '@shop/shared'

export async function saveOrder(order: Omit<Order, 'id'>): Promise<Order> { /* writes to the orders table */ return { id: 'x', ...order } }
export async function loadPrices(): Promise<Record<string, number>> { /* reads the products table */ return {} }

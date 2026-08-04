// EVAL FIXTURE — every defect below is planted on purpose.
// Ground truth lives in test/fixtures/test-review-eval/ground-truth.json. Do not "fix" this file.
import { beforeEach, expect, it, vi } from 'vitest'

import { OrdersService } from '../../../src/orders.service' // module absent on purpose: read as text, never compiled

let repository: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
let service: OrdersService

beforeEach(() => {
  repository = { findMany: vi.fn(), create: vi.fn() }
  service = new OrdersService(repository as never)
})

// C3: compares a literal to itself, so it can never fail.
it('is configured', () => {
  expect(true).toBe(true)
})

// C4: no assertion at all. Runs the code and reports green either way.
it('lists orders for a tenant', async () => {
  repository.findMany.mockResolvedValue([{ id: 'o-1' }])
  await service.listOrders('tenant-a')
})

// C5: the only assertion targets a mock this test configured, and the service is
// never called. It proves vitest can record a call it was handed.
it('filters by tenant', () => {
  repository.findMany.mockResolvedValue([])
  repository.findMany({ where: { tenantId: 'tenant-a' } })
  expect(repository.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-a' } })
})

// M3 + a shallow assertion: asserts the shape of the result instead of its value,
// so any string passes.
it('creates an order', async () => {
  repository.create.mockResolvedValue({ id: 'o-2', total: 1999, currency: 'USD' })
  const created = await service.createOrder({ tenantId: 'tenant-a', total: 1999 })
  expect(typeof created.id).toBe('string')
})

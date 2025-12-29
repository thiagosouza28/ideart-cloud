import { vi } from 'vitest';

// mock the edgeFunctions module used by src/services/cakto.ts
vi.mock('@/services/edgeFunctions', () => ({
  invokeEdgeFunction: vi.fn(async (name: string, body?: Record<string, unknown>) => {
    if (name === 'create-plan') return { plan: { id: 'local-plan', ...body } };
    if (name === 'create-subscription') return { subscription: { id: 'local-sub', ...body }, checkout_url: 'https://checkout.example' };
    return {};
  }),
}));

import { createCaktoPlan, createCaktoSubscription } from '@/services/cakto';
import { invokeEdgeFunction } from '@/services/edgeFunctions';

test('createCaktoPlan calls edge function and returns result', async () => {
  const payload = { name: 'Pro', price: 49.9 };
  const resp = await createCaktoPlan(payload as Record<string, unknown>);
  expect((invokeEdgeFunction as any).mock.calls.length).toBeGreaterThan(0);
  expect((invokeEdgeFunction as any).mock.calls[0][0]).toBe('create-plan');
  expect(resp).toHaveProperty('plan');
  expect(resp.plan.name).toBe('Pro');
});

test('createCaktoSubscription calls edge function and returns checkout_url', async () => {
  const payload = { plan_id: 'plan-1', company_id: 'comp-1', customer: { email: 'a@b.com' } };
  const resp = await createCaktoSubscription(payload as Record<string, unknown>);
  expect((invokeEdgeFunction as any).mock.calls[1][0]).toBe('create-subscription');
  expect(resp).toHaveProperty('checkout_url');
  expect(resp.checkout_url).toBe('https://checkout.example');
});

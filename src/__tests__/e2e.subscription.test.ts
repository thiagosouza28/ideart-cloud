import { vi } from 'vitest';
import { rest, server } from '@/test/setupTests';
import { createCaktoPlan, createCaktoSubscription } from '@/services/cakto';

// Mock the supabase client used by invokeEdgeFunction to return a valid session
vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'token', expires_at: Math.floor(Date.now() / 1000) + 3600 } } }),
      getUser: async () => ({ data: { user: { id: 'test-user' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'new-token', expires_at: Math.floor(Date.now() / 1000) + 7200 } } }),
      signOut: async () => ({ error: null }),
    },
  };
  return { supabase };
});

test('create plan -> hits functions endpoint and returns plan', async () => {
  server.use(
    rest.post(new RegExp('.*/functions/v1/create-plan'), async (req, res, ctx) => {
      const body = await req.json().catch(() => ({}));
      return res(ctx.status(200), ctx.json({ plan: { id: 'plan-123', ...body } }));
    }),
  );

  const payload = { name: 'E2E Plan', price: 99.9 };
  const resp: any = await createCaktoPlan(payload as Record<string, unknown>);
  expect(resp).toHaveProperty('plan');
  expect(resp.plan.id).toBe('plan-123');
});

test('create subscription -> returns checkout_url and subscription record', async () => {
  server.use(
    rest.post(new RegExp('.*/functions/v1/create-subscription'), async (req, res, ctx) => {
      const body = await req.json().catch(() => ({}));
      return res(
        ctx.status(200),
        ctx.json({ subscription: { id: 'sub-789', ...body }, checkout_url: 'https://checkout.test' }),
      );
    }),
  );

  const payload = { plan_id: 'plan-123', company_id: 'comp-1', customer: { email: 'x@y.com' } };
  const resp: any = await createCaktoSubscription(payload as Record<string, unknown>);
  expect(resp).toHaveProperty('checkout_url');
  expect(resp.checkout_url).toBe('https://checkout.test');
});

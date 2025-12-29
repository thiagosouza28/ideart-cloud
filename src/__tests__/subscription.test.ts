import { computeSubscriptionState, DEFAULT_TRIAL_DAYS } from '@/services/subscription';

const now = new Date('2025-12-29T12:00:00.000Z');

test('returns none when no company', () => {
  const s = computeSubscriptionState(null, now);
  expect(s.status).toBe('none');
  expect(s.hasAccess).toBe(true);
});

test('trial company within trial period', () => {
  const created = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
  const company: any = {
    subscription_status: 'trial',
    subscription_start_date: created.toISOString(),
    subscription_end_date: null,
    created_at: created.toISOString(),
  };
  const computed = computeSubscriptionState(company, now);
  expect(computed.status).toBe('trial');
  expect(computed.isTrial).toBe(true);
  expect(computed.hasAccess).toBe(true);
});

test('active subscription with end date in future', () => {
  const company: any = {
    subscription_status: 'active',
    subscription_start_date: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_end_date: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const s = computeSubscriptionState(company, now);
  expect(s.status).toBe('active');
  expect(s.hasAccess).toBe(true);
});

test('expired when end date in past', () => {
  const company: any = {
    subscription_status: 'active',
    subscription_start_date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    subscription_end_date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const s = computeSubscriptionState(company, now);
  expect(s.status).toBe('expired');
  expect(s.hasAccess).toBe(false);
});

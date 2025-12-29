import type { Company } from '@/types/database';

export type SubscriptionState = {
  status: 'trial' | 'active' | 'expired' | 'none';
  daysRemaining: number | null;
  expiresAt: Date | null;
  isTrial: boolean;
  isActive: boolean;
  isExpired: boolean;
  hasAccess: boolean;
  warningLevel: 'none' | 'warning' | 'danger';
  warningReason: 'trial_ending' | 'plan_ending' | 'expired' | null;
};

export const DEFAULT_TRIAL_DAYS = 3;
export const WARNING_DAYS = 2;

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeStatus = (value?: string | null) => (value || '').toLowerCase();

export const computeSubscriptionState = (company: Company | null, now = new Date()): SubscriptionState => {
  if (!company) {
    return {
      status: 'none',
      daysRemaining: null,
      expiresAt: null,
      isTrial: false,
      isActive: false,
      isExpired: false,
      hasAccess: true,
      warningLevel: 'none',
      warningReason: null,
    };
  }

  const rawStatus = normalizeStatus(company.subscription_status);
  const startDate = parseDate(company.subscription_start_date) || parseDate(company.created_at);
  const endDateFromDb = parseDate(company.subscription_end_date);
  const computedTrialEnd = startDate ? addDays(startDate, DEFAULT_TRIAL_DAYS) : null;
  const expiresAt = endDateFromDb || (rawStatus === 'trial' ? computedTrialEnd : null);

  const isTrialStatus = rawStatus === 'trial';
  const isActiveStatus = rawStatus === 'active';
  const isBlockedStatus = ['expired', 'past_due', 'unpaid', 'incomplete', 'canceled', 'cancelled'].includes(rawStatus);
  const isExpiredByDate = Boolean(expiresAt && expiresAt.getTime() < now.getTime());

  let status: SubscriptionState['status'] = 'none';
  if (isActiveStatus && !isExpiredByDate) {
    status = 'active';
  } else if (isTrialStatus && !isExpiredByDate) {
    status = 'trial';
  } else if (isTrialStatus || isActiveStatus || isBlockedStatus || isExpiredByDate) {
    status = 'expired';
  }

  const daysRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000))
    : null;

  const isTrial = status === 'trial';
  const isActive = status === 'active';
  const isExpired = status === 'expired';
  const hasAccess = isTrial || isActive;

  let warningLevel: SubscriptionState['warningLevel'] = 'none';
  let warningReason: SubscriptionState['warningReason'] = null;

  if (isExpired) {
    warningLevel = 'danger';
    warningReason = 'expired';
  } else if (daysRemaining !== null && daysRemaining <= WARNING_DAYS) {
    warningLevel = 'warning';
    warningReason = isTrial ? 'trial_ending' : 'plan_ending';
  }

  return {
    status,
    daysRemaining,
    expiresAt,
    isTrial,
    isActive,
    isExpired,
    hasAccess,
    warningLevel,
    warningReason,
  };
};

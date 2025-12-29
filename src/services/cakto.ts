import { invokeEdgeFunction } from '@/services/edgeFunctions';

export const createCaktoPlan = async (payload: Record<string, unknown>) =>
  invokeEdgeFunction('create-plan', payload);

export const createCaktoSubscription = async (payload: Record<string, unknown>) =>
  invokeEdgeFunction('create-subscription', payload);

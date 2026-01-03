import { invokeEdgeFunction } from '@/services/edgeFunctions';
import { invokePublicFunction } from '@/services/publicFunctions';

export const createCaktoPlan = async (payload: Record<string, unknown>) =>
  invokeEdgeFunction('create-plan', payload);

export const createCaktoSubscription = async (payload: Record<string, unknown>) =>
  invokeEdgeFunction('create-subscription', payload);

export const createCaktoCheckout = async (payload: Record<string, unknown>) =>
  invokePublicFunction('cakto-checkout', payload);

export const completeCaktoSuccess = async (token: string) =>
  invokePublicFunction('cakto-success', { token });

export const listCaktoOffers = async () =>
  invokePublicFunction<{ offers: Array<Record<string, unknown>> }>('cakto-offers');

import type { Order, OrderPayment } from '@/types/database';

type OrderBalanceLike = Pick<Order, 'total' | 'amount_paid' | 'customer_credit_used'> | null | undefined;
type OrderCreditLike = Pick<Order, 'customer_credit_generated'> | null | undefined;
type OrderPaymentLike = Pick<
  OrderPayment,
  'amount' | 'status' | 'source' | 'generated_credit_amount'
>;

export const isCustomerCreditPayment = (
  payment: Pick<OrderPayment, 'source'> | null | undefined,
) => payment?.source === 'customer_credit';

export const getOrderCashPaidAmount = (
  order: Pick<Order, 'amount_paid'> | null | undefined,
) => Math.max(0, Number(order?.amount_paid ?? 0));

export const getOrderCustomerCreditUsedAmount = (
  order: Pick<Order, 'customer_credit_used'> | null | undefined,
) => Math.max(0, Number(order?.customer_credit_used ?? 0));

export const getOrderSettledAmount = (order: OrderBalanceLike) =>
  getOrderCashPaidAmount(order) + getOrderCustomerCreditUsedAmount(order);

export const getOrderRemainingAmount = (order: OrderBalanceLike) =>
  Math.max(0, Number(order?.total ?? 0) - getOrderSettledAmount(order));

export const getOrderBalanceAmount = (order: OrderBalanceLike) =>
  getOrderSettledAmount(order) - Math.max(0, Number(order?.total ?? 0));

export const getOrderGeneratedCreditAmount = (order: OrderCreditLike) =>
  Math.max(0, Number(order?.customer_credit_generated ?? 0));

export const summarizeOrderPayments = (payments: OrderPaymentLike[] = []) => {
  const settledPayments = payments.filter((payment) => payment.status !== 'pendente');
  const cashPaidTotal = settledPayments
    .filter((payment) => !isCustomerCreditPayment(payment))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const creditUsedTotal = settledPayments
    .filter((payment) => isCustomerCreditPayment(payment))
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const generatedCreditTotal = settledPayments.reduce(
    (sum, payment) => sum + Math.max(0, Number(payment.generated_credit_amount ?? 0)),
    0,
  );

  return {
    cashPaidTotal,
    creditUsedTotal,
    settledTotal: cashPaidTotal + creditUsedTotal,
    generatedCreditTotal,
  };
};

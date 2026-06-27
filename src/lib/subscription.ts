export const BILLING_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type SubscriptionDates = {
  activeFrom: Date;
  activeUntil: Date | null;
};

/** End of the current billing period for a subscription row. */
export function getSubscriptionExpiry(sub: SubscriptionDates): Date {
  if (sub.activeUntil) return sub.activeUntil;
  return new Date(sub.activeFrom.getTime() + BILLING_PERIOD_DAYS * MS_PER_DAY);
}

/** Whether a subscription is within its paid billing period. */
export function isSubscriptionCurrent(sub: SubscriptionDates): boolean {
  return getSubscriptionExpiry(sub) > new Date();
}

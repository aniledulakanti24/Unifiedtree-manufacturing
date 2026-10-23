import { JOURNEY_STATUSES, PRODUCTION_STATUSES, afterLastWork, isDelayed, isOpen } from './statuses';
import { orderUnits } from '../utils';

// Customers are not stored separately: each one is the set of work orders carrying their name.

/** Where a customer's work order stands, in the customer's terms. */
export const CUSTOMER_STAGES = [
  { key: 'received', label: 'Received – not started', statuses: ['PENDING_REVIEW', 'ON_HOLD'] },
  {
    key: 'processing',
    label: 'In production',
    get statuses() {
      return PRODUCTION_STATUSES; // the stages the admin set up
    },
  },
  {
    key: 'completed',
    label: 'Completed – awaiting dispatch',
    get statuses() {
      return [...JOURNEY_STATUSES.filter(afterLastWork), 'CLIENT_APPROVED']; // made, only checks left
    },
  },
  { key: 'dispatched', label: 'On the way', statuses: ['DISPATCHED'] },
  { key: 'arrived', label: 'Arrived (delivered)', statuses: ['DELIVERED'] },
];

/** Link to one customer's page. */
export const customerPath = (name) => `/customers/${encodeURIComponent(name)}`;

/** Counts for a set of orders: totals, one per stage, and delayed. */
export function customerFigures(list) {
  return {
    orders: list.length,
    units: list.reduce((s, o) => s + orderUnits(o), 0),
    ...Object.fromEntries(CUSTOMER_STAGES.map((st) => [st.key, list.filter((o) => st.statuses.includes(o.status)).length])),
    delayed: list.filter(isDelayed).length,
  };
}

/** One row per customer, with contact details from their latest order and all-time counts. */
export function customerList(orders) {
  const byName = new Map();
  orders.forEach((o) => byName.set(o.customer.name, [...(byName.get(o.customer.name) ?? []), o]));
  return [...byName.entries()].map(([name, list]) => {
    const latest = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return {
      name,
      contact: latest.customer,
      lastOrderAt: latest.createdAt,
      open: list.filter(isOpen).length,
      ...customerFigures(list),
    };
  });
}

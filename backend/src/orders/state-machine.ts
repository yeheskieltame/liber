export type OrderState =
  | "scanned"
  | "quoted"
  | "approved"
  | "awaiting_settlement"
  | "completed"
  | "failed";

export type OrderEvent =
  | "quote_received"
  | "user_approved"
  | "payment_submitted"
  | "settled"
  | "failure";

export class InvalidTransitionError extends Error {
  constructor(state: OrderState, event: OrderEvent) {
    super(`Cannot apply event "${event}" to state "${state}"`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<OrderState, Partial<Record<OrderEvent, OrderState>>> = {
  scanned: { quote_received: "quoted", failure: "failed" },
  quoted: { user_approved: "approved", failure: "failed" },
  approved: { payment_submitted: "awaiting_settlement", failure: "failed" },
  awaiting_settlement: { settled: "completed", failure: "failed" },
  completed: {},
  failed: {},
};

export function transition(current: OrderState, event: OrderEvent): OrderState {
  const stateTransitions = TRANSITIONS[current];
  if (!stateTransitions) {
    throw new InvalidTransitionError(current, event);
  }
  const next = stateTransitions[event];
  if (!next) {
    throw new InvalidTransitionError(current, event);
  }
  return next;
}

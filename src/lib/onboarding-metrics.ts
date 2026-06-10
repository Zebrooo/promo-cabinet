// Pure derivations for the onboarding analytics dashboard. Kept free of any
// runtime deps (no fetch, no node:crypto) so it unit-tests in isolation — the
// page (server component) and bff-client stay thin wrappers around these.
//
// Shapes mirror the BFF analytics-store (migration 0067:
// user_actions_onboarding_overview / _funnel). bff-client imports these types.

export interface OnboardingOverview {
  welcome_shown: number;
  welcome_skipped: number;
  role_picked: number;
  role_buyer: number;
  role_seller: number;
  completed: number;
  completed_finished: number;
  completed_autoskip: number;
  skipped_explicit: number;
  auto_skipped_steps: number;
  restarted: number;
  step_shown_total: number;
  step_next_total: number;
}

export interface OnboardingFunnelRow {
  step_id: string;
  step_idx: number;
  shown_count: number;
  next_count: number;
  auto_skipped_count: number;
}

/** part/whole as a 1-decimal percent; null when whole is 0/negative (no base). */
export function pct(part: number, whole: number): number | null {
  if (!whole || whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

/** Share of shown onboardings that reached "completed". */
export function completionRate(o: OnboardingOverview): number | null {
  return pct(o.completed, o.welcome_shown);
}

export interface RoleSplit {
  buyer: number;
  seller: number;
  buyerPct: number | null;
  sellerPct: number | null;
}

/** Buyer/seller counts + their share of all role picks. */
export function roleSplit(o: OnboardingOverview): RoleSplit {
  return {
    buyer: o.role_buyer,
    seller: o.role_seller,
    buyerPct: pct(o.role_buyer, o.role_picked),
    sellerPct: pct(o.role_seller, o.role_picked),
  };
}

export interface StepFlow {
  step_id: string;
  step_idx: number;
  shown: number;
  advanced: number;
  autoSkipped: number;
  /** shown − advanced − autoSkipped, floored at 0: users who left on the step. */
  abandoned: number;
  /** advanced/shown as a percent; null when the step was never shown. */
  advanceRate: number | null;
}

/** Funnel rows → per-step flow, sorted by step_idx ascending, with abandoned
 *  derived as the residual (shown that neither advanced nor were auto-skipped). */
export function stepFlows(rows: OnboardingFunnelRow[]): StepFlow[] {
  return [...rows]
    .sort((a, b) => a.step_idx - b.step_idx)
    .map((r) => ({
      step_id: r.step_id,
      step_idx: r.step_idx,
      shown: r.shown_count,
      advanced: r.next_count,
      autoSkipped: r.auto_skipped_count,
      abandoned: Math.max(0, r.shown_count - r.next_count - r.auto_skipped_count),
      advanceRate: pct(r.next_count, r.shown_count),
    }));
}

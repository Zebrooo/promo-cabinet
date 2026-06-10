import { describe, expect, it } from 'vitest';
import {
  pct,
  completionRate,
  roleSplit,
  stepFlows,
  type OnboardingOverview,
  type OnboardingFunnelRow,
} from './onboarding-metrics';

const overview = (over: Partial<OnboardingOverview> = {}): OnboardingOverview => ({
  welcome_shown: 0,
  welcome_skipped: 0,
  role_picked: 0,
  role_buyer: 0,
  role_seller: 0,
  completed: 0,
  completed_finished: 0,
  completed_autoskip: 0,
  skipped_explicit: 0,
  auto_skipped_steps: 0,
  restarted: 0,
  step_shown_total: 0,
  step_next_total: 0,
  ...over,
});

describe('pct', () => {
  it('returns a 1-decimal percent', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(50, 200)).toBe(25);
  });
  it('returns null when the base is zero or negative', () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(5, -1)).toBeNull();
  });
});

describe('completionRate', () => {
  it('is completed / welcome_shown', () => {
    expect(completionRate(overview({ welcome_shown: 200, completed: 50 }))).toBe(25);
  });
  it('is null when nobody saw onboarding', () => {
    expect(completionRate(overview({ welcome_shown: 0, completed: 0 }))).toBeNull();
  });
});

describe('roleSplit', () => {
  it('splits buyer/seller as shares of role_picked', () => {
    const r = roleSplit(overview({ role_picked: 100, role_buyer: 70, role_seller: 30 }));
    expect(r).toEqual({ buyer: 70, seller: 30, buyerPct: 70, sellerPct: 30 });
  });
  it('null percentages when no role was ever picked', () => {
    const r = roleSplit(overview({ role_picked: 0, role_buyer: 0, role_seller: 0 }));
    expect(r.buyerPct).toBeNull();
    expect(r.sellerPct).toBeNull();
  });
});

describe('stepFlows', () => {
  const rows: OnboardingFunnelRow[] = [
    { step_id: 'second', step_idx: 2, shown_count: 80, next_count: 60, auto_skipped_count: 5 },
    { step_id: 'first', step_idx: 1, shown_count: 100, next_count: 80, auto_skipped_count: 0 },
  ];

  it('sorts by step_idx ascending', () => {
    expect(stepFlows(rows).map((s) => s.step_id)).toEqual(['first', 'second']);
  });

  it('derives abandoned = shown − advanced − autoSkipped (floored at 0)', () => {
    const flows = stepFlows(rows);
    expect(flows[0].abandoned).toBe(20); // 100 − 80 − 0
    expect(flows[1].abandoned).toBe(15); // 80 − 60 − 5
  });

  it('never reports negative abandoned when counts overlap', () => {
    const odd: OnboardingFunnelRow[] = [
      { step_id: 'x', step_idx: 1, shown_count: 10, next_count: 8, auto_skipped_count: 5 },
    ];
    expect(stepFlows(odd)[0].abandoned).toBe(0); // max(0, 10−8−5)
  });

  it('computes advanceRate = advanced / shown', () => {
    expect(stepFlows(rows)[0].advanceRate).toBe(80); // 80/100
    expect(stepFlows(rows)[1].advanceRate).toBe(75); // 60/80
  });

  it('advanceRate is null for an unseen step', () => {
    const unseen: OnboardingFunnelRow[] = [
      { step_id: 'x', step_idx: 1, shown_count: 0, next_count: 0, auto_skipped_count: 0 },
    ];
    expect(stepFlows(unseen)[0].advanceRate).toBeNull();
  });
});

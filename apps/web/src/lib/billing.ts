export type BillingEntitlement = {
  subscription_status: string;
  payment_status?: string | null;
  has_active_access: boolean;
  can_write: boolean;
  can_read?: boolean;
  trial_days_remaining?: number | null;
  trial_ends_at?: string | null;
  billing_setup_status: string;
  payment_prepared?: boolean;
  checkout_available?: boolean;
  card_enabled?: boolean;
  can_start_checkout?: boolean;
  can_resume_checkout?: boolean;
  resume_checkout_url?: string | null;
  requires_payment_action?: boolean;
  blocking_reason?: string | null;
  recommended_action?: string | null;
  plan_code?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  sandbox_mode?: boolean;
};

export type BillingCheckout = {
  checkout_id: string;
  checkout_url: string | null;
  status: string;
  expires_at?: string | null;
  amount_cents: number;
  currency: string;
  billing_type: string;
  charge_type: string;
};

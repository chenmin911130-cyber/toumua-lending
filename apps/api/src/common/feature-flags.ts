export function customerSelfApplyEnabled(): boolean {
  return process.env.FEATURE_CUSTOMER_SELF_APPLY === "1";
}

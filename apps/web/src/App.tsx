import { Navigate, Route, Routes } from "react-router-dom";
import { AccountLayout, CustomerLayout, PublicLayout, StaffLayout } from "./layouts";
import {
  AcceptInvitationPage,
  AccountPage,
  ForgotPasswordPage,
  HelpPage,
  HomePage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  StaffLoginPage,
  VerifyEmailPage,
  VerifyPendingPage,
} from "./pages/public";
import { CustomerApplicationsPage, CustomerHomePage, LaterModulePage } from "./pages/customer";
import {
  AccountLinkPage,
  ApplicationWizardPage,
  ApplicationsPage,
  BorrowersPage,
  CustomerApplicationDetailPage,
  ValuationPage,
} from "./pages/lending";
import { ActivityLogPage, StaffAccountsPage, StaffHomePage, UnavailableStaffPage } from "./pages/staff";

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email/pending" element={<VerifyPendingPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
        <Route path="/help" element={<HelpPage />} />
      </Route>

      <Route element={<CustomerLayout />}>
        <Route path="/customer" element={<CustomerHomePage />} />
        <Route path="/customer/applications" element={<CustomerApplicationsPage />} />
        <Route path="/customer/applications/:id" element={<CustomerApplicationDetailPage />} />
        <Route path="/customer/loans" element={<CustomerHomePage />} />
        <Route path="/customer/loans/:loanId" element={<LaterModulePage title="Loan" />} />
        <Route path="/customer/loans/:loanId/repayments" element={<LaterModulePage title="Repayments" />} />
        <Route path="/customer/loans/:loanId/security/:assetId?" element={<LaterModulePage title="Security" />} />
        <Route path="/notifications" element={<LaterModulePage title="Notifications" />} />
      </Route>

      <Route element={<AccountLayout />}>
        <Route path="/account" element={<AccountPage />} />
      </Route>

      <Route element={<StaffLayout />}>
        <Route path="/staff" element={<StaffHomePage />} />
        <Route path="/staff/borrowers" element={<BorrowersPage />} />
        <Route path="/staff/borrowers/new" element={<BorrowersPage />} />
        <Route path="/staff/borrowers/:id" element={<BorrowersPage />} />
        <Route path="/staff/borrowers/:id/edit" element={<BorrowersPage />} />
        <Route path="/staff/borrowers/:id/account-link" element={<AccountLinkPage />} />
        <Route path="/staff/applications" element={<ApplicationsPage />} />
        <Route path="/staff/applications/:id/edit/:step" element={<ApplicationWizardPage />} />
        <Route path="/staff/applications/:id/valuation" element={<ValuationPage />} />
        <Route path="/staff/applications/:id/review" element={<ApplicationWizardPage />} />
        <Route path="/staff/collateral" element={<UnavailableStaffPage title="Collateral" />} />
        <Route path="/staff/collateral/:id" element={<UnavailableStaffPage title="Collateral item" />} />
        <Route path="/staff/collateral/:id/return" element={<UnavailableStaffPage title="Return" />} />
        <Route path="/staff/collateral/:id/sale" element={<UnavailableStaffPage title="Sale" />} />
        <Route path="/staff/loans" element={<UnavailableStaffPage title="Loans" />} />
        <Route path="/staff/loans/:id" element={<UnavailableStaffPage title="Loan" />} />
        <Route path="/staff/loans/:id/disbursement" element={<UnavailableStaffPage title="Disbursement" />} />
        <Route path="/staff/loans/:id/repayment" element={<UnavailableStaffPage title="Repayment" />} />
        <Route path="/staff/transactions" element={<UnavailableStaffPage title="Transactions" />} />
        <Route path="/staff/transactions/:id" element={<UnavailableStaffPage title="Transaction" />} />
        <Route path="/staff/corrections" element={<UnavailableStaffPage title="Corrections" />} />
        <Route path="/staff/corrections/:id" element={<UnavailableStaffPage title="Correction" />} />
        <Route path="/staff/payment-attempts/:id" element={<UnavailableStaffPage title="Payment attempt" />} />
        <Route path="/staff/admin/accounts" element={<StaffAccountsPage />} />
        <Route path="/staff/admin/activity" element={<ActivityLogPage />} />
        <Route path="/notifications" element={<UnavailableStaffPage title="Notifications" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

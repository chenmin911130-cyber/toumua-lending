import { Navigate, Route, Routes } from "react-router-dom";
import { AccountLayout, CustomerLayout, PublicLayout, StaffLayout } from "./layouts";
import {
  AcceptInvitationPage,
  AccountPage,
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
  StaffLoginPage,
  VerifyEmailPage,
  VerifyPendingPage,
} from "./pages/public";
import { HelpPage } from "./pages/help";
import { HomePage } from "./pages/home";
import { CustomerApplicationsPage, CustomerHomePage } from "./pages/customer";
import {
  CustomerLoanDetailPage,
  CustomerLoansListPage,
  CustomerReceiptPage,
  CustomerRepaymentsPage,
  CustomerSecurityPage,
} from "./pages/customer-loans";
import { NotificationsPage } from "./pages/notifications";
import {
  ApplicationReviewPage,
  StaffCollateralDetailPage,
  StaffCollateralPage,
  StaffDisbursementPage,
  StaffLoanDetailPage,
  StaffLoansPage,
  StaffRepaymentPage,
  StaffReceiptPage,
  StaffTransactionDetailPage,
  StaffTransactionsPage,
} from "./pages/batch04";
import {
  StaffCorrectionDetailPage,
  StaffCorrectionsPage,
  StaffDefaultPage,
  StaffPaymentAttemptPage,
  StaffReturnPage,
  StaffSalePage,
  StaffSaleReceiptPage,
} from "./pages/batch05";
import {
  AccountLinkPage,
  ApplicationWizardPage,
  ApplicationsPage,
  BorrowersPage,
  CustomerApplicationDetailPage,
  ValuationPage,
} from "./pages/lending";
import { ActivityLogPage, StaffAccountsPage, StaffHomePage } from "./pages/staff";

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
        <Route path="/customer/loans" element={<CustomerLoansListPage />} />
        <Route path="/customer/loans/:loanId" element={<CustomerLoanDetailPage />} />
        <Route path="/customer/loans/:loanId/repayments" element={<CustomerRepaymentsPage />} />
        <Route path="/customer/loans/:loanId/security/:assetId?" element={<CustomerSecurityPage />} />
        <Route path="/customer/receipts/:id" element={<CustomerReceiptPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
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
        <Route path="/staff/applications/:id/review" element={<ApplicationReviewPage />} />
        <Route path="/staff/collateral" element={<StaffCollateralPage />} />
        <Route path="/staff/collateral/:id" element={<StaffCollateralDetailPage />} />
        <Route path="/staff/collateral/:id/return" element={<StaffReturnPage />} />
        <Route path="/staff/collateral/:id/sale" element={<StaffSalePage />} />
        <Route path="/staff/loans" element={<StaffLoansPage />} />
        <Route path="/staff/loans/:id" element={<StaffLoanDetailPage />} />
        <Route path="/staff/loans/:id/disbursement" element={<StaffDisbursementPage />} />
        <Route path="/staff/loans/:id/repayment" element={<StaffRepaymentPage />} />
        <Route path="/staff/loans/:id/default" element={<StaffDefaultPage />} />
        <Route path="/staff/loans/:id/sale-receipt" element={<StaffSaleReceiptPage />} />
        <Route path="/staff/transactions" element={<StaffTransactionsPage />} />
        <Route path="/staff/transactions/:id" element={<StaffTransactionDetailPage />} />
        <Route path="/staff/receipts/:id" element={<StaffReceiptPage />} />
        <Route path="/staff/corrections" element={<StaffCorrectionsPage />} />
        <Route path="/staff/corrections/:id" element={<StaffCorrectionDetailPage />} />
        <Route path="/staff/payment-attempts/:id" element={<StaffPaymentAttemptPage />} />
        <Route path="/staff/admin/accounts" element={<StaffAccountsPage />} />
        <Route path="/staff/admin/activity" element={<ActivityLogPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

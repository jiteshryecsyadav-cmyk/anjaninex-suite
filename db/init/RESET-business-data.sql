-- ============================================================================
-- ⚠️  FULL BUSINESS DATA RESET  ⚠️
-- Saara business/demo data DELETE karega: parties, bills, orders, payments,
-- vouchers, ledgers, AD (suppliers/buyers/appointments), HR (staff/attendance/
-- payroll), commission, AI logs, contacts.
--
-- NAHI chhuega (safe): aapka login (core.users), roles/permissions, firm,
-- subscription, branches, departments, modules, wallet, voucher counters,
-- chart-of-accounts heads/groups (taaki accounting seed dobara na karna pade).
--
-- pgAdmin Query Tool me ye PURI file paste karke RUN (F5) karein.
-- Wapas nahi aayega — pakka soch ke chalao.
-- ============================================================================

BEGIN;

-- TRUNCATE ... CASCADE child rows ko bhi saaf kar deta hai. Order isliye diya
-- hai ki padhne me clear rahe; CASCADE baki ko bhi le lega.

-- ---- AI ----
TRUNCATE
    ai.extraction_logs,
    ai.cache
CASCADE;

-- ---- HR ----
TRUNCATE
    hr.payroll_records,
    hr.leave_requests,
    hr.leave_balances,
    hr.selfies,
    hr.attendance_logs,
    hr.location_trails,
    hr.employee_profiles
CASCADE;

-- ---- Active Directory ----
TRUNCATE
    suppliers.appointment_staff,
    suppliers.appointments,
    suppliers.rates,
    suppliers.photos,
    suppliers.buyer_profiles,
    suppliers.supplier_profiles
CASCADE;

-- ---- Trading ----
TRUNCATE
    trading.commission_invoice_lines,
    trading.commission_invoices,
    trading.commission,
    trading.payment_allocations,
    trading.payments,
    trading.goods_return_lines,
    trading.gr_lines,
    trading.goods_returns,
    trading.gr,
    trading.bill_lines,
    trading.bills,
    trading.order_lines,
    trading.orders,
    trading.party_profiles,
    trading.items
CASCADE;

-- ---- Accounting (vouchers/ledgers — keep chart of accounts heads/groups) ----
TRUNCATE
    accounting.voucher_lines,
    accounting.vouchers
CASCADE;
-- Party/contact-linked ledgers hata do; system ledgers (Sales/Purchase/GST/Cash)
-- contact_id NULL hote hain — woh bache rahenge.
DELETE FROM accounting.ledgers WHERE contact_id IS NOT NULL;

-- ---- Voucher/bill numbering counters reset (taaki numbering 1 se shuru ho) ----
DELETE FROM platform.voucher_counters;

-- ---- Core Master contacts (sabse aakhir — sab inhe reference karte the) ----
TRUNCATE core.contacts CASCADE;

COMMIT;

SELECT 'RESET DONE — saara business data clean. Login/firm/branches/COA safe.' AS status;

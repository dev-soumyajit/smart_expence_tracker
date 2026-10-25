# Accounting and data policy

## Units, dates and accounts

Amounts are integer INR paise in `BIGINT` columns and validated integer fields. Transactions have positive amounts and an explicit kind. No floating-point arithmetic determines financial records. PostgreSQL aggregate `NUMERIC` results are explicitly converted back to integers at service boundaries. Clients format amounts for display; the shared amount parser converts decimal input by splitting digits instead of multiplying a floating-point value.

Supported account types are bank, cash, credit and other. A credit account has a signed balance: a negative value means liability. Opening balances are immutable snapshots before the first transaction recorded in the app. If the user imports transactions that predate the snapshot, they must select the correct historical opening balance first or create a separate account. There is no automatic reconciliation integration yet.

Balances are derived from opening balance plus all active ledger movements. They are never stored in a separate mutable balance column. Archived accounts retain their real balances and remain in totals, but cannot receive new entries until restored. Eligible available funds include bank, cash and other accounts; credit balances are excluded and card debt is reported separately.

India calendar dates use `Asia/Kolkata`. Transaction timestamps must include an offset and are normalized to UTC. Date filters are inclusive dates, implemented as `[start midnight IST, midnight after end IST)` converted to UTC before querying. Future calendar dates are rejected for ledger entries; use recurring reminders for future plans.

## Ledger effects

| Entry | Source account | Destination account | Income | Net expenses |
| --- | ---: | ---: | ---: | ---: |
| Income | +amount | — | +amount | — |
| Expense | −amount | — | — | +amount |
| Transfer | −amount | +amount | — | — |
| Linked refund | +amount | — | — | −amount |

An ATM withdrawal is a bank-to-cash transfer. A later cash purchase is an expense. A card purchase is an expense from a credit account, making its signed balance more negative. A card repayment is a bank-to-credit transfer, making the liability smaller without adding another expense.

Refunds must reference an active owned expense, return to that account, occur no earlier than the purchase, and stay within the unrefunded amount. They inherit the original category. Partial refunds are allowed; the original remains visible. Refunds reduce net spending in the period in which the refund occurred. They can make period net expenses negative.

## Atomicity and concurrency

Transactions are written in database transactions. Account rows are locked in sorted order before mutations; refunds also lock their original expense. PostgreSQL serializes competing refunds and writes. Composite foreign keys prevent cross-owner account/category/original references. Constraints enforce positive amounts and valid transfer/refund relationships.

Financial database sessions finalize with FastAPI function-scoped dependencies, **before a success response is sent**. Flush/commit failures roll back the whole request. A correction reverses the original and writes a replacement within the same database transaction. Reversing an expense with live refunds is refused until its refunds have been reversed.

Reversal marks the record void; it does not delete it. Audit events retain creation, reversal and replacement relationships. Audit events are retained until account deletion; they are not an externally tamper-proof audit service.

An optional `Idempotency-Key` is unique per user and stores the original payload hash. Exact retries return the original record. Reuse with different input returns 409. The web and mobile entry forms provide a stable key per open form. Concurrent same-key writes to the same account serialize. A different-account race is resolved by the unique database constraint and returns a retryable conflict.

## Imports and recurring bills

CSV upload is normalized and validated before commit. Preview creates an owned import job and rows, not ledger entries. Limits: 500 KB of text and 1,000 rows; columns are explicitly mapped. Amounts are decimal INR and dates are ISO 8601. Naive CSV times are interpreted as IST. Only income and expense imports are supported initially; ambiguous ATM/card-payment rows must be corrected in review instead of blindly imported.

The same account/file/mapping hash returns the same job. A committed job cannot commit twice. Matching account/amount/type/time rows, including repeated rows in a file, are conservatively flagged and skipped. Commit rechecks duplicate candidates under the account lock so two stale previews cannot create duplicate entries. This heuristic may flag legitimate identical transactions; a user can add those manually. Independent bank provider transaction identifiers and richer bank-specific mapping are future work.

Recurring reminders are schedules until explicitly confirmed. Confirmation writes one expense for the specified due occurrence and advances the schedule. Repeating confirmation for the same occurrence returns the original transaction. Monthly/yearly recurrence retains an anchor day through short months. Weekly recurrence advances seven days. Credit repayments must be entered as transfers; the current recurring confirmation flow is for expenses only.

## Budgets and estimates

Budgets are explicit inclusive date ranges, overall or category-specific. Weekly/monthly/salary/custom budgets are represented by their dates; automatic budget rollover is not implemented. Actual spending uses expenses less refunds, excluding transfers. Utilization is integer basis points. Projection uses current average net daily spending across elapsed days and labels fewer than seven days as preliminary. It assumes activity was recorded throughout the elapsed period.

A salary day beyond the last day of a month clamps to that last day. The next boundary returns to the configured anchor. The current cycle runs through the day before the next boundary.

Safe-to-spend uses:

```text
liquidity cap = max(0,
  eligible account balances - card debt - minimum reserve
  - goal allocations - unpaid essential scheduled occurrences through cycle end)
budget cap = min(max(0, remaining overall budget - those unpaid bills))
estimate = min(liquidity cap, budget cap), or liquidity cap if no overall budget
daily estimate = estimate // remaining cycle days
```

Bills are subtracted once in each independent constraint; taking the minimum prevents subtracting them twice from a combined total. Optional bills and future income are excluded. Overdue active bills are reserved. Recurrence enumeration is bounded at 400 occurrences per rule; very old rules need review. Category budgets are shown separately rather than incorrectly added together as an overall cap. This is a budgeting estimate, not a safety guarantee.

Goal contributions are allocations of existing funds, not ledger income, expenses, or transfers. They reserve funds in safe-to-spend. Goal allocations are not yet bound to individual bank accounts; reallocation/withdrawal is remaining work. Monthly requirements use 30-day months, round upward to paise, and assume no investment returns.

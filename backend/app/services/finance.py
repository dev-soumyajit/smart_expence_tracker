from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, case
from ..models import Transaction, Category, Budget, Recurring, Goal, Contribution
from .ledger import balances, pack

IST = ZoneInfo("Asia/Kolkata")


def today():
    return datetime.now(IST).date()


def shift_month(day: date, months: int, anchor: int | None = None):
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(anchor or day.day, monthrange(year, month + 1)[1]))


def cycle(on: date, salary_day: int):
    start = on.replace(day=min(salary_day, monthrange(on.year, on.month)[1]))
    if start > on:
        start = shift_month(start, -1, salary_day)
    return start, shift_month(start, 1, salary_day) - timedelta(days=1)


def period(user_id, start: date, end: date):
    return [Transaction.user_id == user_id, Transaction.voided.is_(False), Transaction.occurred_at >= datetime.combine(start, time.min, IST).astimezone(timezone.utc), Transaction.occurred_at < datetime.combine(end + timedelta(days=1), time.min, IST).astimezone(timezone.utc)]


def net_expense():
    return case((Transaction.kind == "expense", Transaction.amount), (Transaction.kind == "refund", -Transaction.amount), else_=0)


def budget_summary(db, budget):
    conditions = period(budget.user_id, budget.start_date, budget.end_date)
    if budget.category_id:
        conditions.append(Transaction.category_id == budget.category_id)
    spent = int(db.scalar(select(func.coalesce(func.sum(net_expense()), 0)).where(*conditions)))
    elapsed = max(1, min((today() - budget.start_date).days + 1, (budget.end_date - budget.start_date).days + 1))
    total_days = (budget.end_date - budget.start_date).days + 1
    projected = max(0, spent) * total_days // elapsed if today() >= budget.start_date else 0
    return {**pack(budget), "spent": spent, "remaining": budget.amount - spent, "utilization_bps": max(0, spent) * 10000 // budget.amount, "projected": projected, "overrun": max(0, projected - budget.amount), "preliminary": elapsed < 7}


def goals(db, user_id):
    sums = dict(db.execute(select(Contribution.goal_id, func.sum(Contribution.amount)).where(Contribution.user_id == user_id).group_by(Contribution.goal_id)).all())
    result = []
    for goal in db.scalars(select(Goal).where(Goal.user_id == user_id)):
        saved = int(sums.get(goal.id, 0))
        months = max(1, ((goal.target_date - today()).days + 29) // 30)
        result.append({**pack(goal), "saved": saved, "progress_bps": saved * 10000 // goal.target, "monthly_required": (max(0, goal.target - saved) + months - 1) // months})
    return result


def summary(db, user, start: date | None = None, end: date | None = None):
    cycle_start, cycle_end = cycle(today(), user.salary_day)
    start, end = start or cycle_start, end or cycle_end
    conditions = period(user.id, start, end)
    income, expense = db.execute(select(func.coalesce(func.sum(case((Transaction.kind == "income", Transaction.amount), else_=0)), 0), func.coalesce(func.sum(net_expense()), 0)).where(*conditions)).one()
    income, expense = int(income), int(expense)
    accounts = balances(db, user.id)
    available = sum(a["balance"] for a in accounts if a["type"] != "credit")
    credit_debt = sum(max(0, -a["balance"]) for a in accounts if a["type"] == "credit")
    budgets = [budget_summary(db, b) for b in db.scalars(select(Budget).where(Budget.user_id == user.id, Budget.start_date <= today(), Budget.end_date >= today()))]
    bills = list(db.scalars(select(Recurring).where(Recurring.user_id == user.id, Recurring.active.is_(True), Recurring.next_due <= cycle_end).order_by(Recurring.next_due)))
    # Reserve every scheduled occurrence up to the cycle boundary, including overdue bills.
    obligations = 0
    for bill in bills:
        due, occurrences = bill.next_due, 0
        while due <= cycle_end and occurrences < 400:
            if bill.essential:
                obligations += bill.amount
            occurrences += 1
            due = due + timedelta(days=7) if bill.frequency == "weekly" else shift_month(due, 12 if bill.frequency == "yearly" else 1, bill.anchor_day)
    reserved_goals = int(db.scalar(select(func.coalesce(func.sum(Contribution.amount), 0)).where(Contribution.user_id == user.id)))
    after_reserves = max(0, available - credit_debt - user.minimum_balance - reserved_goals - obligations)
    overall = [b for b in budgets if b["category_id"] is None]
    budget_cap = min((max(0, b["remaining"] - obligations) for b in overall), default=after_reserves)
    safe = min(after_reserves, budget_cap)
    days = max(1, (cycle_end - today()).days + 1)
    category_rows = db.execute(select(Transaction.category_id, func.sum(net_expense())).where(*conditions).group_by(Transaction.category_id)).all()
    categories = {c.id: c for c in db.scalars(select(Category).where(Category.user_id == user.id))}
    breakdown = [{"id": category_id, "name": categories[category_id].name if category_id in categories else "Uncategorized", "color": categories[category_id].color if category_id in categories else "#7C8CFF", "amount": int(amount)} for category_id, amount in category_rows if amount > 0]
    breakdown.sort(key=lambda x: x["amount"], reverse=True)
    # Buckets are calculated by database range aggregates, preserving IST boundaries on both DBs.
    width = max(1, ((end - start).days + 1 + 6) // 7)
    trend = []
    cursor = start
    while cursor <= end:
        stop = min(end, cursor + timedelta(days=width - 1))
        spent = db.scalar(select(func.coalesce(func.sum(net_expense()), 0)).where(*period(user.id, cursor, stop)))
        trend.append({"date": cursor.isoformat(), "amount": int(spent)})
        cursor = stop + timedelta(days=1)
    insights = []
    for b in budgets:
        if b["utilization_bps"] >= 8000:
            insights.append({"type": "budget", "title": f"{b['name']} is {b['utilization_bps'] // 100}% used", "detail": "Review this budget before your next purchase."})
    if bills:
        insights.append({"type": "bill", "title": f"{len(bills)} upcoming or overdue bill(s)", "detail": "Scheduled payments only become expenses when you confirm payment."})
    if not insights:
        insights.append({"type": "info", "title": "Your next chapter starts here" if not income and not expense else "A clearer picture, one entry at a time", "detail": "Add accounts, record spending, and set a budget to build useful insights."})
    cash_ids = [a["id"] for a in accounts if a["type"] == "cash"]
    cash_expense = db.scalar(select(func.coalesce(func.sum(net_expense()), 0)).where(*conditions, Transaction.account_id.in_(cash_ids))) if cash_ids else 0
    return {"start_date": start, "end_date": end, "cycle_start": cycle_start, "cycle_end": cycle_end, "available": available, "credit_debt": credit_debt, "income": int(income), "expenses": int(expense), "savings": int(income - expense), "savings_rate_bps": (income - expense) * 10000 // income if income > 0 else None, "cash_expenses": int(cash_expense), "safe_to_spend": safe, "daily_safe": safe // days, "days_remaining": days, "reserved_bills": obligations, "reserved_goals": reserved_goals, "minimum_balance": user.minimum_balance, "assumptions": "Estimate using current funds less card debt, minimum balance, goal allocations and unpaid essential bills. Overall budget limits also apply. Bills are reserved once per constraint; the tighter constraint wins. Future income is excluded. Goal allocations do not move money. Category limits are shown separately. Not a guarantee.", "accounts": accounts, "budgets": budgets, "categories": breakdown, "trend": trend, "upcoming": [pack(b) for b in bills], "goals": goals(db, user.id), "insights": insights}

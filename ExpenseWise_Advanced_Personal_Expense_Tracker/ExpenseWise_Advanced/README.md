# ExpenseWise — Advanced Personal Expense Tracker

Full-stack project based on the supplied PRD: responsive frontend, FastAPI backend, SQLite database, user authentication, transaction CRUD, categories, budgets, charts, savings goals, recurring transactions, CSV preview/import/export, PDF reports, budget alerts, and explainable spending insights.

## Windows setup
**Terminal 1 — backend** (run from this project folder):
```powershell
cd backend
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
If PowerShell blocks activation, use Command Prompt and `.venv\Scripts\activate.bat`. If `reportlab` is missing, run `py -m pip install reportlab`.

**Terminal 2 — frontend**, from project root:
```powershell
cd frontend
py -m http.server 5500 --bind 127.0.0.1
```
Open `http://127.0.0.1:5500/`. API docs: `http://127.0.0.1:8000/docs`; health: `http://127.0.0.1:8000/api/health`.

Database auto-creates at `backend/data/expensewise.db`. Register a new account in the app. CSV format columns: `type,amount,transaction_date,category,payment_method,note` (only first three are required). Import is previewed before confirmation.

## Features
- PBKDF2 password hashing and signed 12-hour bearer tokens
- Per-user transaction ownership, CRUD, search and filters
- Income/expense totals, Chart.js category and daily charts
- Monthly overall/category budgets and threshold alerts
- Savings goals with progress updates
- Recurring weekly/monthly/yearly rules and idempotent due processing
- CSV preview with row-level errors, duplicate checks, confirm import, CSV export
- PDF finance report
- Rule-based insights and privacy reminder
- SQLite tables and index for transaction date lookups

## Honest limitations / next upgrades
Insights are transparent rules, not a trained machine-learning model. This demo does not connect to banks, send email/SMS notifications, perform receipt OCR, or provide multi-currency conversion. Those require separate supported providers and additional implementation. Before public deployment, change `EXPENSEWISE_SECRET`, add rate limiting, stronger session handling/CSRF protections as appropriate, HTTPS, tests, backups, and a security review. Never collect banking passwords or card credentials.

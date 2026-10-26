# ◈ ExpenseWise — Advanced Personal Expense Tracker

A full-stack personal finance and expense tracking web application. Built with high-performance responsive UI, intelligent budget tracking, visual Chart.js analytics, savings goal milestones, automated recurring rules, CSV import/export, and PDF financial reports.

Designed to work **both locally with FastAPI + SQLite** and **seamlessly standalone on Vercel** without requiring local Python server execution.

---

## 🌟 Key Features

1. **Dedicated Authentication Portal**:
   - First-screen login and registration experience.
   - **1-Click Demo Sign In** (`demo@expensewise.com`) with instant realistic pre-populated dataset.
   - Secure token session persistence.

2. **Interactive Financial Dashboard**:
   - Real-time income, expense, and net balance calculation.
   - Interactive **Category Spending Doughnut Chart** (Chart.js) with color-coded categories.
   - **Daily Cashflow Trend Line Chart** tracking income vs expense activity.
   - Quick Add Transaction inline widget for rapid daily logging.
   - Recent transaction feed and budget health indicators.

3. **Complete Transaction Management**:
   - Full CRUD: Add, in-place Edit Modal, and Delete with confirmation.
   - Live search by note, category, or payment method.
   - Multi-criteria filtering by Type (Income/Expense), Category, and Date Range.
   - Category badges with emoji icons (🍔 Food, 🚗 Transport, 🛍️ Shopping, 💡 Bills, 🏠 Rent, etc.).
   - Payment method tags (UPI, Card, Cash, Bank Transfer, Other).

4. **Intelligent Monthly Budgets & Alert Thresholds**:
   - Set overall or category-specific monthly spending limits.
   - Customizable alert thresholds (e.g. notify at 80% limit).
   - Visual progress bars with dynamic color coding: Safe (Green), Caution (Amber), Over-limit (Red).
   - Top banner alerts when spending approaches or exceeds threshold.

5. **Savings Goals & Milestone Tracking**:
   - Create custom targets (Emergency Fund, Tech Gadgets, Vacation).
   - Target date countdown with required savings velocity.
   - Quick "+ Deposit" modal with 1-click preset increment buttons (+₹500, +₹1,000, +₹5,000, +₹10,000).
   - Achievement milestone badge when goal reaches 100%.

6. **Automated Recurring Rules**:
   - Define repeating subscriptions, rent, and monthly salaries.
   - Frequency support: Monthly, Weekly, Yearly.
   - **"Process Due Now"** automation engine that checks next due dates and logs transactions automatically.

7. **Smart Insights & Financial Health Score**:
   - Financial Health Score meter (0–100) based on savings rate, budget compliance, and burn rate.
   - Transparent rule-based insights: Month-over-month spending comparison, top spending category alert, and actionable advice.

8. **Data Portability**:
   - **Spreadsheet CSV Export**: Complete transaction history with categories, timestamps, and notes.
   - **Formal PDF Report**: Executive financial statement with summary totals and formatted ledger table.
   - **Bulk CSV Import**: Interactive statement upload with drag-and-drop, format validation, preview of valid/invalid rows, and duplicate detection.
   - Sample CSV template download.

9. **Customization & Tools**:
   - Multi-currency switcher: **₹ INR**, **$ USD**, **€ EUR**, **£ GBP**.
   - Dark Mode / Light Mode with seamless transition and persistence.
   - Category Manager to add custom categories.
   - 1-Click Demo Data Seeder and JSON Backup / Restore tool.

---

## 🚀 Deployment to Vercel

The application is pre-configured with `vercel.json` for **1-click instant deployment**:

### Option 1: Direct GitHub Push & Vercel Import (Recommended)
1. Push this repository to GitHub under `ManaswiniYasam-917`:
   ```bash
   git init
   git add .
   git commit -m "Complete ExpenseWise full-stack application"
   git branch -M main
   git remote add origin https://github.com/ManaswiniYasam-917/ExpenseWise_Personal_Expense_Tracker.git
   git push -u origin main
   ```
2. Go to **[vercel.com/new](https://vercel.com/new)** and import `ManaswiniYasam-917/ExpenseWise_Personal_Expense_Tracker`.
3. Click **Deploy**. Vercel will instantly host the project.
4. Anyone visiting your Vercel URL can access and use every single button, form, chart, budget, and export feature without running any code locally!

---

## 💻 Local Full-Stack Development

### 1. Backend (FastAPI + SQLite)
```powershell
cd ExpenseWise_Advanced_Personal_Expense_Tracker\ExpenseWise_Advanced\backend
.venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```
- API Docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/health`

### 2. Frontend
```powershell
cd ExpenseWise_Advanced_Personal_Expense_Tracker\ExpenseWise_Advanced\frontend
python -m http.server 5500 --bind 127.0.0.1
```
Open `http://127.0.0.1:5500` in any web browser.

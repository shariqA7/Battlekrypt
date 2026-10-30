-- Admin ledger: expenses (service, employee, rent, utilities, other).
CREATE TYPE "ExpenseCategory" AS ENUM ('service', 'employee', 'rent', 'utilities', 'other');

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "vendor" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "receiptUrl" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidNote" TEXT,
    "voidedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_date_idx" ON "Expense"("category", "date");

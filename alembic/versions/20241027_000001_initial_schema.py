"""Initial schema.

Revision ID: 20241027_000001
Revises: 
Create Date: 2024-10-27 00:00:01.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20241027_000001"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


transaction_type_enum = postgresql.ENUM(
    "expenditure",
    "income",
    "debt",
    "receivable",
    name="transactiontype",
)


def upgrade() -> None:
    transaction_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column("occurred_at", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("type", transaction_type_enum, nullable=False),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False, server_default=sa.text("'manual'")),
        sa.Column("items", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "debts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=512), nullable=True),
        sa.Column("principal_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("total_installments", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("interest_rate", sa.Numeric(6, 3), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'active'")),
    )

    op.create_table(
        "debt_installments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("timezone('utc', now())"),
            nullable=False,
        ),
        sa.Column(
            "debt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("debts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("installment_number", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("paid_at", sa.Date(), nullable=True),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("debt_id", "installment_number", name="uq_debt_installment_number"),
    )


def downgrade() -> None:
    op.drop_table("debt_installments")
    op.drop_table("debts")
    op.drop_table("transactions")
    transaction_type_enum.drop(op.get_bind(), checkfirst=True)

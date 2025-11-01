"""add paid amount to installments

Revision ID: 58e71bcb1dd5
Revises: 1d2f3a4b5c6d
Create Date: 2025-11-01 23:27:53.634495
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from collections.abc import Sequence

revision: str = "58e71bcb1dd5"
down_revision: str | None = '1d2f3a4b5c6d'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None



def upgrade() -> None:
    op.add_column(
        "debt_installments",
        sa.Column("paid_amount", sa.Numeric(14, 2), nullable=False, server_default=sa.text("0")),
    )
    op.execute("UPDATE debt_installments SET paid_amount = 0")
    op.alter_column("debt_installments", "paid_amount", server_default=None)

    op.create_table(
        "debt_installment_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
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
            "installment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("debt_installments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_at", sa.Date(), nullable=False),
        sa.Column(
            "transaction_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("transactions.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("debt_installment_payments")
    op.drop_column("debt_installments", "paid_amount")

"""add debt wallet field

Revision ID: 4001d57af35a
Revises: 8d06157bb5cf
Create Date: 2025-11-06 18:24:31.788034
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


from collections.abc import Sequence

revision: str = "4001d57af35a"
down_revision: str | None = '8d06157bb5cf'
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("debts", sa.Column("category", sa.String(length=32), nullable=True))
    op.add_column("debts", sa.Column("wallet_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "debts",
        sa.Column("beneficiary_name", sa.String(length=128), nullable=True),
    )
    op.execute("UPDATE debts SET category = 'manual' WHERE category IS NULL")
    op.alter_column("debts", "category", nullable=False, server_default="manual")
    op.create_foreign_key(
        "fk_debts_wallet_id_wallets",
        "debts",
        "wallets",
        ["wallet_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_debts_wallet_id_wallets", "debts", type_="foreignkey")
    op.drop_column("debts", "beneficiary_name")
    op.drop_column("debts", "wallet_id")
    op.drop_column("debts", "category")

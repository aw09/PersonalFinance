"""Add wallet linkage and beneficiary to debts"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20251103_add_debt_wallet_fields"
down_revision = "20251102_8d06157bb5cf"
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

"""add_wallets

Revision ID: 8d06157bb5cf
Revises: 58e71bcb1dd5
Create Date: 2025-11-02 20:05:32.662408
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from uuid import uuid4

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "8d06157bb5cf"
down_revision: str | None = "58e71bcb1dd5"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


WALLET_TYPE_ENUM_NAME = "wallettype"


def upgrade() -> None:
    bind = op.get_bind()
    enum_exists = (
        bind.execute(
            sa.text("SELECT 1 FROM pg_type WHERE typname = :name"),
            {"name": WALLET_TYPE_ENUM_NAME},
        ).scalar()
        is not None
    )

    if not enum_exists:
        op.execute(
            sa.text(
                f"CREATE TYPE {WALLET_TYPE_ENUM_NAME} AS ENUM ('regular', 'investment', 'credit')"
            )
        )

    wallet_type_column_enum = postgresql.ENUM(
        "regular",
        "investment",
        "credit",
        name=WALLET_TYPE_ENUM_NAME,
        create_type=False,
    )

    op.create_table(
        "wallets",
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
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("type", wallet_type_column_enum, nullable=False),
        sa.Column(
            "balance",
            sa.Numeric(14, 2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "currency",
            sa.String(length=3),
            server_default=sa.text("'IDR'::varchar"),
            nullable=False,
        ),
        sa.Column("credit_limit", sa.Numeric(14, 2), nullable=True),
        sa.Column("settlement_day", sa.Integer(), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(("user_id",), ("users.id",), ondelete="CASCADE"),
    )
    op.create_index(op.f("ix_wallets_user_id"), "wallets", ["user_id"])

    op.add_column(
        "users",
        sa.Column("default_wallet_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "users_default_wallet_id_fkey",
        "users",
        "wallets",
        ("default_wallet_id",),
        ("id",),
        ondelete="SET NULL",
    )

    op.add_column(
        "transactions",
        sa.Column("wallet_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "transactions_wallet_id_fkey",
        "transactions",
        "wallets",
        ("wallet_id",),
        ("id",),
        ondelete="SET NULL",
    )

    connection = op.get_bind()

    user_rows = connection.execute(sa.text("SELECT id FROM users")).fetchall()
    wallet_mapping: dict[str, str] = {}
    for (user_id,) in user_rows:
        wallet_id = str(uuid4())
        connection.execute(
            sa.text(
                """
                INSERT INTO wallets (id, name, type, balance, currency, credit_limit, settlement_day, user_id)
                VALUES (:id, :name, :type, :balance, :currency, NULL, NULL, :user_id)
                """
            ),
            {
                "id": wallet_id,
                "name": "Main Wallet",
                "type": "regular",
                "balance": Decimal("0"),
                "currency": "IDR",
                "user_id": user_id,
            },
        )
        wallet_mapping[user_id] = wallet_id

    for user_id, wallet_id in wallet_mapping.items():
        connection.execute(
            sa.text(
                """
                UPDATE users
                SET default_wallet_id = :wallet_id
                WHERE id = :user_id
                """
            ),
            {"wallet_id": wallet_id, "user_id": user_id},
        )
        connection.execute(
            sa.text(
                """
                UPDATE transactions
                SET wallet_id = :wallet_id
                WHERE user_id = :user_id
                """
            ),
            {"wallet_id": wallet_id, "user_id": user_id},
        )

    balance_rows = connection.execute(
        sa.text(
            """
            SELECT
                wallet_id,
                COALESCE(
                    SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END),
                    0
                ) AS income_total,
                COALESCE(
                    SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END),
                    0
                ) AS expense_total
            FROM transactions
            WHERE wallet_id IS NOT NULL
            GROUP BY wallet_id
            """
        )
    ).fetchall()

    for wallet_id, income_total, expense_total in balance_rows:
        income_total = income_total or Decimal("0")
        expense_total = expense_total or Decimal("0")
        balance = Decimal(income_total) - Decimal(expense_total)
        connection.execute(
            sa.text(
                """
                UPDATE wallets
                SET balance = :balance
                WHERE id = :wallet_id
                """
            ),
            {"balance": balance, "wallet_id": wallet_id},
        )


def downgrade() -> None:
    op.drop_constraint("transactions_wallet_id_fkey", "transactions", type_="foreignkey")
    op.drop_column("transactions", "wallet_id")

    op.drop_constraint("users_default_wallet_id_fkey", "users", type_="foreignkey")
    op.drop_column("users", "default_wallet_id")

    op.drop_index(op.f("ix_wallets_user_id"), table_name="wallets")
    op.drop_table("wallets")

    bind = op.get_bind()
    enum_in_use = bind.execute(
        sa.text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE udt_name = :name
            LIMIT 1
            """
        ),
        {"name": WALLET_TYPE_ENUM_NAME},
    ).scalar() is not None

    if not enum_in_use:
        wallet_type_enum = sa.Enum("regular", "investment", "credit", name=WALLET_TYPE_ENUM_NAME)
        wallet_type_enum.drop(bind, checkfirst=True)

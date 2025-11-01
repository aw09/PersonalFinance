"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

from collections.abc import Sequence

revision: str = "${up_revision}"
down_revision: str | None = ${repr(down_revision) if down_revision else "None"}
branch_labels: Sequence[str] | None = ${repr(branch_labels) if branch_labels else "None"}
depends_on: Sequence[str] | None = ${repr(depends_on) if depends_on else "None"}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}

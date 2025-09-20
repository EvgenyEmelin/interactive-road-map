"""add_crosswalks_table

Revision ID: 24aa6b117633
Revises: 0894e85032e8
Create Date: 2025-09-20 09:36:40.996208

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '24aa6b117633'
down_revision: Union[str, Sequence[str], None] = '0894e85032e8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

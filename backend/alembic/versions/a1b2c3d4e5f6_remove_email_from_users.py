"""remove email from users

Revision ID: a1b2c3d4e5f6
Revises: 8e2031ee8d23
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '8e2031ee8d23'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('email')


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('email', sa.String(), nullable=True))

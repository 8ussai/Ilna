"""user accent color

Revision ID: 0002_accent_color
Revises: 0001_baseline
Create Date: 2026-10-21 22:06:36.555703
"""
from alembic import op
import sqlalchemy as sa


revision = '0002_accent_color'
down_revision = '0001_baseline'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('accent_color', sa.String(), nullable=True))



def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('accent_color')


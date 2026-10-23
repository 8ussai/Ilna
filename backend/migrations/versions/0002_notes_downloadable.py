"""course setting: members can download notes

Revision ID: 0002_notes_downloadable
Revises: 0001_baseline
Create Date: 2026-10-23
"""
from alembic import op
import sqlalchemy as sa


revision = '0002_notes_downloadable'
down_revision = '0001_baseline'
branch_labels = None
depends_on = None


def upgrade():
    # off for every existing course: members can't download notes until the owner allows it
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('notes_downloadable', sa.Boolean(), server_default='0', nullable=False))


def downgrade():
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.drop_column('notes_downloadable')

"""anonymous posts

Revision ID: 0003_anonymous_posts
Revises: 0002_accent_color
Create Date: 2026-10-21 22:33:54.900650
"""
from alembic import op
import sqlalchemy as sa


revision = '0003_anonymous_posts'
down_revision = '0002_accent_color'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('thread_anon_numbers',
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('post_id', 'user_id'),
    sa.UniqueConstraint('post_id', 'number')
    )
    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_anonymous', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('anonymity_switched', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('anon_counter', sa.Integer(), server_default='0', nullable=False))

    with op.batch_alter_table('replies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_anonymous', sa.Boolean(), server_default='0', nullable=False))
        batch_op.add_column(sa.Column('anonymity_switched', sa.Boolean(), server_default='0', nullable=False))



def downgrade():
    with op.batch_alter_table('replies', schema=None) as batch_op:
        batch_op.drop_column('anonymity_switched')
        batch_op.drop_column('is_anonymous')

    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.drop_column('anon_counter')
        batch_op.drop_column('anonymity_switched')
        batch_op.drop_column('is_anonymous')

    op.drop_table('thread_anon_numbers')

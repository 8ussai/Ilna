"""friends

Revision ID: 0005_friends
Revises: 0004_post_images
Create Date: 2026-10-21 23:14:47.463205
"""
from alembic import op
import sqlalchemy as sa


revision = '0005_friends'
down_revision = '0004_post_images'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('friends',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('friend_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['friend_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'friend_id')
    )
    with op.batch_alter_table('friends', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_friends_friend_id'), ['friend_id'], unique=False)



def downgrade():
    with op.batch_alter_table('friends', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_friends_friend_id'))

    op.drop_table('friends')

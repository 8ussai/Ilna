"""post images

Revision ID: 0004_post_images
Revises: 0003_anonymous_posts
Create Date: 2026-10-21 22:56:27.327566
"""
from alembic import op
import sqlalchemy as sa


revision = '0004_post_images'
down_revision = '0003_anonymous_posts'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('post_images',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('file_path', sa.String(), nullable=False),
    sa.Column('width', sa.Integer(), nullable=False),
    sa.Column('height', sa.Integer(), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('is_animated', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('post_images', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_post_images_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_post_images_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_post_images_user_id'), ['user_id'], unique=False)



def downgrade():
    with op.batch_alter_table('post_images', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_post_images_user_id'))
        batch_op.drop_index(batch_op.f('ix_post_images_post_id'))
        batch_op.drop_index(batch_op.f('ix_post_images_id'))

    op.drop_table('post_images')

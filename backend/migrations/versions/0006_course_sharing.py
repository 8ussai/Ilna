"""course sharing

Revision ID: 0006_course_sharing
Revises: 0005_friends
Create Date: 2026-10-21 23:40:21.652642
"""
import secrets

from alembic import op
import sqlalchemy as sa

# the same alphabet as services/course_sharing.py: no 0/O or 1/I/L to misread
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _new_code(taken: set[str]) -> str:
    while True:
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        code = f"{raw[:4]}-{raw[4:]}"
        if code not in taken:
            taken.add(code)
            return code


revision = '0006_course_sharing'
down_revision = '0005_friends'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('course_members',
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('last_opened_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('course_id', 'user_id')
    )
    with op.batch_alter_table('course_members', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_members_user_id'), ['user_id'], unique=False)

    op.create_table('course_share_responses',
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('course_id', 'user_id')
    )
    with op.batch_alter_table('course_share_responses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_share_responses_user_id'), ['user_id'], unique=False)

    op.create_table('course_shares',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('target_type', sa.String(), nullable=False),
    sa.Column('target', sa.String(), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'target_type', 'target')
    )
    with op.batch_alter_table('course_shares', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_shares_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_shares_id'), ['id'], unique=False)

    # existing courses get a code each (private, like new ones) before the column becomes required
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('share_code', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('is_public', sa.Boolean(), server_default='0', nullable=False))
    bind = op.get_bind()
    taken: set[str] = set()
    for (course_id,) in bind.execute(sa.text("SELECT id FROM courses")).all():
        bind.execute(sa.text("UPDATE courses SET share_code = :code WHERE id = :id"), {"code": _new_code(taken), "id": course_id})
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.alter_column('share_code', existing_type=sa.String(), nullable=False)
        batch_op.create_index(batch_op.f('ix_courses_share_code'), ['share_code'], unique=True)

    # attempts so far were all the course owner's
    with op.batch_alter_table('quiz_attempts', schema=None) as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
    bind.execute(sa.text(
        "UPDATE quiz_attempts SET user_id = (SELECT courses.user_id FROM study_items "
        "JOIN courses ON courses.id = study_items.course_id WHERE study_items.id = quiz_attempts.item_id)"
    ))
    with op.batch_alter_table('quiz_attempts', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.Integer(), nullable=False)
        batch_op.create_index(batch_op.f('ix_quiz_attempts_user_id'), ['user_id'], unique=False)
        batch_op.create_foreign_key('fk_quiz_attempts_user_id_users', 'users', ['user_id'], ['id'], ondelete='CASCADE')



def downgrade():
    with op.batch_alter_table('quiz_attempts', schema=None) as batch_op:
        batch_op.drop_constraint('fk_quiz_attempts_user_id_users', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_quiz_attempts_user_id'))
        batch_op.drop_column('user_id')

    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_courses_share_code'))
        batch_op.drop_column('is_public')
        batch_op.drop_column('share_code')

    with op.batch_alter_table('course_shares', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_shares_id'))
        batch_op.drop_index(batch_op.f('ix_course_shares_course_id'))

    op.drop_table('course_shares')
    with op.batch_alter_table('course_share_responses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_share_responses_user_id'))

    op.drop_table('course_share_responses')
    with op.batch_alter_table('course_members', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_members_user_id'))

    op.drop_table('course_members')

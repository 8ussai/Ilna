"""baseline

Revision ID: 0001_baseline
Revises: 
Create Date: 2026-10-21 22:06:12.711967
"""
from alembic import op
import sqlalchemy as sa


revision = '0001_baseline'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('admin_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(), nullable=True),
    sa.Column('sent_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('attempts', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('admin_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_admin_codes_id'), ['id'], unique=False)

    op.create_table('admin_log',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('action', sa.String(), nullable=False),
    sa.Column('target_type', sa.String(), nullable=True),
    sa.Column('target_id', sa.Integer(), nullable=True),
    sa.Column('details', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('admin_log', schema=None) as batch_op:
        batch_op.create_index('ix_admin_log_created', ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_admin_log_id'), ['id'], unique=False)

    op.create_table('maintenance',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('starts_at', sa.DateTime(), nullable=False),
    sa.Column('ends_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(), nullable=False),
    sa.Column('first_name', sa.String(), nullable=False),
    sa.Column('last_name', sa.String(), nullable=False),
    sa.Column('email', sa.String(), nullable=False),
    sa.Column('hashed_password', sa.String(), nullable=False),
    sa.Column('country', sa.String(), nullable=False),
    sa.Column('university', sa.String(), nullable=False),
    sa.Column('college', sa.String(), nullable=False),
    sa.Column('major', sa.String(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('otp_hash', sa.String(), nullable=True),
    sa.Column('otp_sent_at', sa.DateTime(), nullable=True),
    sa.Column('otp_expires_at', sa.DateTime(), nullable=True),
    sa.Column('otp_attempts', sa.Integer(), nullable=False),
    sa.Column('reset_hash', sa.String(), nullable=True),
    sa.Column('reset_sent_at', sa.DateTime(), nullable=True),
    sa.Column('reset_expires_at', sa.DateTime(), nullable=True),
    sa.Column('reset_attempts', sa.Integer(), nullable=False),
    sa.Column('password_changed_at', sa.DateTime(), nullable=True),
    sa.Column('is_banned', sa.Boolean(), nullable=False),
    sa.Column('banned_reason', sa.String(), nullable=True),
    sa.Column('banned_at', sa.DateTime(), nullable=True),
    sa.Column('is_premium', sa.Boolean(), nullable=False),
    sa.Column('premium_since', sa.DateTime(), nullable=True),
    sa.Column('is_test', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('test_password_enc', sa.String(), nullable=True),
    sa.Column('is_system', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)
        batch_op.create_index(batch_op.f('ix_users_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)

    op.create_table('contact_messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('subject', sa.String(), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('handled_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('contact_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_contact_messages_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_contact_messages_user_id'), ['user_id'], unique=False)

    op.create_table('courses',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('description', sa.String(), nullable=True),
    sa.Column('color', sa.String(), nullable=True),
    sa.Column('last_opened_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_courses_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_courses_user_id'), ['user_id'], unique=False)

    op.create_table('posts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('scope', sa.String(), server_default='general', nullable=False),
    sa.Column('university', sa.String(), nullable=False),
    sa.Column('college', sa.String(), nullable=False),
    sa.Column('major', sa.String(), nullable=False),
    sa.Column('pinned_until', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_posts_college'), ['college'], unique=False)
        batch_op.create_index(batch_op.f('ix_posts_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_posts_major'), ['major'], unique=False)
        batch_op.create_index(batch_op.f('ix_posts_scope'), ['scope'], unique=False)
        batch_op.create_index(batch_op.f('ix_posts_university'), ['university'], unique=False)
        batch_op.create_index(batch_op.f('ix_posts_user_id'), ['user_id'], unique=False)

    op.create_table('study_generations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('study_generations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_study_generations_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_study_generations_user_id'), ['user_id'], unique=False)

    op.create_table('course_links',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('url', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('course_links', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_links_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_links_id'), ['id'], unique=False)

    op.create_table('course_materials',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('file_path', sa.String(), nullable=False),
    sa.Column('kind', sa.String(), server_default='document', nullable=False),
    sa.Column('mime_type', sa.String(), nullable=True),
    sa.Column('duration_sec', sa.Float(), nullable=True),
    sa.Column('size_bytes', sa.Integer(), server_default='0', nullable=False),
    sa.Column('is_rag_indexed', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_materials_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_materials_id'), ['id'], unique=False)

    op.create_table('course_notes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(), nullable=True),
    sa.Column('kind', sa.String(), server_default='text', nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('indexed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('course_notes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_course_notes_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_course_notes_id'), ['id'], unique=False)

    op.create_table('post_votes',
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('vote_dir', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('post_id', 'user_id')
    )
    op.create_table('replies',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=False),
    sa.Column('parent_id', sa.Integer(), nullable=True),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False),
    sa.Column('removed_by_admin', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['parent_id'], ['replies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('replies', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_replies_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_replies_parent_id'), ['parent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_replies_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_replies_user_id'), ['user_id'], unique=False)

    op.create_table('study_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('course_id', sa.Integer(), nullable=False),
    sa.Column('kind', sa.String(), nullable=False),
    sa.Column('title', sa.String(), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('error', sa.String(), nullable=True),
    sa.Column('requested_language', sa.String(), nullable=True),
    sa.Column('main_language', sa.String(), nullable=True),
    sa.Column('translation_status', sa.String(), nullable=True),
    sa.Column('translation_error', sa.String(), nullable=True),
    sa.Column('view_language', sa.String(), nullable=True),
    sa.Column('options', sa.Text(), nullable=False),
    sa.Column('sources', sa.Text(), nullable=False),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('study_items', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_study_items_course_id'), ['course_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_study_items_id'), ['id'], unique=False)

    op.create_table('material_transcripts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('material_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('progress', sa.Float(), nullable=False),
    sa.Column('language', sa.String(), nullable=True),
    sa.Column('segments', sa.Text(), nullable=True),
    sa.Column('error', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['material_id'], ['course_materials.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('material_transcripts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_material_transcripts_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_material_transcripts_material_id'), ['material_id'], unique=True)

    op.create_table('notifications',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('actor_id', sa.Integer(), nullable=False),
    sa.Column('type', sa.String(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=True),
    sa.Column('reply_id', sa.Integer(), nullable=True),
    sa.Column('vote_dir', sa.Integer(), nullable=True),
    sa.Column('message', sa.Text(), nullable=True),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reply_id'], ['replies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notifications_id'), ['id'], unique=False)
        batch_op.create_index('ix_notifications_user_read', ['user_id', 'is_read'], unique=False)

    op.create_table('quiz_attempts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('item_id', sa.Integer(), nullable=False),
    sa.Column('answers', sa.Text(), nullable=False),
    sa.Column('score', sa.Integer(), nullable=False),
    sa.Column('total', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['item_id'], ['study_items.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('quiz_attempts', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_quiz_attempts_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_quiz_attempts_item_id'), ['item_id'], unique=False)

    op.create_table('reply_votes',
    sa.Column('reply_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('vote_dir', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['reply_id'], ['replies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('reply_id', 'user_id')
    )
    op.create_table('reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('reporter_id', sa.Integer(), nullable=False),
    sa.Column('post_id', sa.Integer(), nullable=True),
    sa.Column('reply_id', sa.Integer(), nullable=True),
    sa.Column('reason', sa.String(), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('status', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reply_id'], ['replies.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reporter_id', 'post_id', name='uq_reports_reporter_post'),
    sa.UniqueConstraint('reporter_id', 'reply_id', name='uq_reports_reporter_reply')
    )
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reports_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reports_post_id'), ['post_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reports_reply_id'), ['reply_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reports_reporter_id'), ['reporter_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reports_status'), ['status'], unique=False)



def downgrade():
    with op.batch_alter_table('reports', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reports_status'))
        batch_op.drop_index(batch_op.f('ix_reports_reporter_id'))
        batch_op.drop_index(batch_op.f('ix_reports_reply_id'))
        batch_op.drop_index(batch_op.f('ix_reports_post_id'))
        batch_op.drop_index(batch_op.f('ix_reports_id'))

    op.drop_table('reports')
    op.drop_table('reply_votes')
    with op.batch_alter_table('quiz_attempts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_quiz_attempts_item_id'))
        batch_op.drop_index(batch_op.f('ix_quiz_attempts_id'))

    op.drop_table('quiz_attempts')
    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_index('ix_notifications_user_read')
        batch_op.drop_index(batch_op.f('ix_notifications_id'))

    op.drop_table('notifications')
    with op.batch_alter_table('material_transcripts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_material_transcripts_material_id'))
        batch_op.drop_index(batch_op.f('ix_material_transcripts_id'))

    op.drop_table('material_transcripts')
    with op.batch_alter_table('study_items', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_study_items_id'))
        batch_op.drop_index(batch_op.f('ix_study_items_course_id'))

    op.drop_table('study_items')
    with op.batch_alter_table('replies', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_replies_user_id'))
        batch_op.drop_index(batch_op.f('ix_replies_post_id'))
        batch_op.drop_index(batch_op.f('ix_replies_parent_id'))
        batch_op.drop_index(batch_op.f('ix_replies_id'))

    op.drop_table('replies')
    op.drop_table('post_votes')
    with op.batch_alter_table('course_notes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_notes_id'))
        batch_op.drop_index(batch_op.f('ix_course_notes_course_id'))

    op.drop_table('course_notes')
    with op.batch_alter_table('course_materials', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_materials_id'))
        batch_op.drop_index(batch_op.f('ix_course_materials_course_id'))

    op.drop_table('course_materials')
    with op.batch_alter_table('course_links', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_course_links_id'))
        batch_op.drop_index(batch_op.f('ix_course_links_course_id'))

    op.drop_table('course_links')
    with op.batch_alter_table('study_generations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_study_generations_user_id'))
        batch_op.drop_index(batch_op.f('ix_study_generations_id'))

    op.drop_table('study_generations')
    with op.batch_alter_table('posts', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_posts_user_id'))
        batch_op.drop_index(batch_op.f('ix_posts_university'))
        batch_op.drop_index(batch_op.f('ix_posts_scope'))
        batch_op.drop_index(batch_op.f('ix_posts_major'))
        batch_op.drop_index(batch_op.f('ix_posts_id'))
        batch_op.drop_index(batch_op.f('ix_posts_college'))

    op.drop_table('posts')
    with op.batch_alter_table('courses', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_courses_user_id'))
        batch_op.drop_index(batch_op.f('ix_courses_id'))

    op.drop_table('courses')
    with op.batch_alter_table('contact_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_contact_messages_user_id'))
        batch_op.drop_index(batch_op.f('ix_contact_messages_id'))

    op.drop_table('contact_messages')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_username'))
        batch_op.drop_index(batch_op.f('ix_users_id'))
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
    op.drop_table('maintenance')
    with op.batch_alter_table('admin_log', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_admin_log_id'))
        batch_op.drop_index('ix_admin_log_created')

    op.drop_table('admin_log')
    with op.batch_alter_table('admin_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_admin_codes_id'))

    op.drop_table('admin_codes')

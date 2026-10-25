"""Email verification, email OTPs and transactional mail outbox."""
from alembic import op
import sqlalchemy as sa

revision = "b6d8a41f302e"
down_revision = "f21c8b90d734"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("signup_pending", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table("email_throttles", sa.Column("key", sa.String(80), primary_key=True), sa.Column("window_start", sa.DateTime(timezone=True), nullable=False), sa.Column("count", sa.Integer(), nullable=False), sa.Column("last_sent_at", sa.DateTime(timezone=True)))
    op.create_table("email_challenges",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE")), sa.Column("email_key", sa.String(64), nullable=False), sa.Column("purpose", sa.String(24), nullable=False), sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("consumed_at", sa.DateTime(timezone=True)), sa.Column("superseded_at", sa.DateTime(timezone=True)), sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("registration_password_hash", sa.String(255)), sa.Column("registration_name", sa.String(80)),
        sa.CheckConstraint("purpose IN ('verify_email','email_login','password_reset')"), sa.CheckConstraint("attempts >= 0"))
    op.create_index("ix_email_challenges_user_id", "email_challenges", ["user_id"])
    op.create_index("ix_email_challenges_email_key", "email_challenges", ["email_key"])
    op.create_table("mail_jobs",
        sa.Column("id", sa.String(36), primary_key=True), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("challenge_id", sa.String(36), sa.ForeignKey("email_challenges.id", ondelete="CASCADE")),
        sa.Column("event_key", sa.String(120), nullable=False, unique=True), sa.Column("kind", sa.String(24), nullable=False), sa.Column("payload", sa.Text(), nullable=False), sa.Column("status", sa.String(16), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False), sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False), sa.Column("lease_until", sa.DateTime(timezone=True)), sa.Column("provider_id", sa.String(100)), sa.Column("last_error", sa.String(50)),
        sa.CheckConstraint("status IN ('pending','sending','retry','sent','failed','expired')"), sa.CheckConstraint("attempts >= 0"))
    op.create_index("ix_mail_jobs_user_id", "mail_jobs", ["user_id"])
    op.create_index("ix_mail_jobs_status", "mail_jobs", ["status"])


def downgrade():
    op.drop_table("mail_jobs")
    op.drop_table("email_challenges")
    op.drop_table("email_throttles")
    op.drop_column("users", "signup_pending")
    op.drop_column("users", "email_verified_at")

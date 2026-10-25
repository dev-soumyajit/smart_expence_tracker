"""Reviewed SMS fingerprints, retry-safe corrections and ledger links. No message bodies."""
from alembic import op
import sqlalchemy as sa

revision = "f21c8b90d734"
down_revision = "a8dc5effd32e"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("sms_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("transaction_id", sa.String(36), nullable=False),
        sa.Column("confirmed_hash", sa.String(64), nullable=False),
        sa.Column("last_edit_key", sa.String(80)),
        sa.Column("last_edit_hash", sa.String(64)),
        sa.UniqueConstraint("user_id", "fingerprint"),
        sa.ForeignKeyConstraint(["user_id", "transaction_id"], ["transactions.user_id", "transactions.id"]),
    )
    op.create_index("ix_sms_receipts_user_id", "sms_receipts", ["user_id"])


def downgrade():
    op.drop_index("ix_sms_receipts_user_id", table_name="sms_receipts")
    op.drop_table("sms_receipts")

"""add seasons

Revision ID: c3d4e5f601a2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-07

"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f601a2'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create seasons table
    op.create_table(
        'seasons',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('sm_season_id', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )

    # 2. Seed WC2022 as an inactive placeholder (startup will activate WC2026)
    op.execute("INSERT INTO seasons (id, name, sm_season_id, is_active) VALUES (1, '2022', 18017, 0)")

    # 3. Create season_participants table
    op.create_table(
        'season_participants',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('season_id', sa.Integer(), sa.ForeignKey('seasons.id'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.PrimaryKeyConstraint('user_id', 'season_id'),
    )

    # 4. Migrate existing users.is_active → season_participants for WC2022
    op.execute(
        "INSERT INTO season_participants (user_id, season_id, is_active) "
        "SELECT id, 1, is_active FROM users"
    )

    # 5. Add season_id to players (no FK constraint — SQLite doesn't enforce them)
    with op.batch_alter_table('players') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.Integer(), nullable=True, server_default='1'))

    # 6. Add season_id to coaches
    with op.batch_alter_table('coaches') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.Integer(), nullable=True, server_default='1'))

    # 7. Add season_id to fixtures
    with op.batch_alter_table('fixtures') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.Integer(), nullable=True, server_default='1'))

    # 8. Recreate drafts with new unique constraint (user_id, player_id, season_id)
    op.execute("""
        CREATE TABLE drafts_new (
            id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            season_id INTEGER DEFAULT 1,
            player_id INTEGER,
            coach_id INTEGER,
            PRIMARY KEY (id),
            UNIQUE (user_id, player_id, season_id)
        )
    """)
    op.execute("INSERT INTO drafts_new (id, user_id, season_id, player_id, coach_id) SELECT id, user_id, 1, player_id, coach_id FROM drafts")
    op.execute("DROP TABLE drafts")
    op.execute("ALTER TABLE drafts_new RENAME TO drafts")

    # 9. Recreate scoring_rules with (event_key, season_id) unique constraint
    op.execute("""
        CREATE TABLE scoring_rules_new (
            id INTEGER NOT NULL,
            season_id INTEGER DEFAULT 1,
            event_key VARCHAR NOT NULL,
            weight FLOAT NOT NULL,
            PRIMARY KEY (id),
            UNIQUE (event_key, season_id)
        )
    """)
    op.execute("INSERT INTO scoring_rules_new (id, season_id, event_key, weight) SELECT id, 1, event_key, weight FROM scoring_rules")
    op.execute("DROP TABLE scoring_rules")
    op.execute("ALTER TABLE scoring_rules_new RENAME TO scoring_rules")

    # 10. Add season_id to tournament_config
    with op.batch_alter_table('tournament_config') as batch_op:
        batch_op.add_column(sa.Column('season_id', sa.Integer(), nullable=True, server_default='1'))

    # 11. Remove is_active from users
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('is_active')


def downgrade() -> None:
    # Restore is_active on users (all False by default)
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default='0'))

    # Restore scoring_rules with single unique on event_key
    op.execute("""
        CREATE TABLE scoring_rules_old (
            id INTEGER NOT NULL,
            event_key VARCHAR NOT NULL,
            weight FLOAT NOT NULL,
            PRIMARY KEY (id),
            UNIQUE (event_key)
        )
    """)
    op.execute("INSERT INTO scoring_rules_old (id, event_key, weight) SELECT id, event_key, weight FROM scoring_rules")
    op.execute("DROP TABLE scoring_rules")
    op.execute("ALTER TABLE scoring_rules_old RENAME TO scoring_rules")

    # Restore drafts with old unique constraint
    op.execute("""
        CREATE TABLE drafts_old (
            id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            player_id INTEGER,
            coach_id INTEGER,
            PRIMARY KEY (id),
            UNIQUE (user_id, player_id)
        )
    """)
    op.execute("INSERT INTO drafts_old (id, user_id, player_id, coach_id) SELECT id, user_id, player_id, coach_id FROM drafts")
    op.execute("DROP TABLE drafts")
    op.execute("ALTER TABLE drafts_old RENAME TO drafts")

    with op.batch_alter_table('tournament_config') as batch_op:
        batch_op.drop_column('season_id')

    with op.batch_alter_table('fixtures') as batch_op:
        batch_op.drop_column('season_id')

    with op.batch_alter_table('coaches') as batch_op:
        batch_op.drop_column('season_id')

    with op.batch_alter_table('players') as batch_op:
        batch_op.drop_column('season_id')

    op.drop_table('season_participants')
    op.drop_table('seasons')

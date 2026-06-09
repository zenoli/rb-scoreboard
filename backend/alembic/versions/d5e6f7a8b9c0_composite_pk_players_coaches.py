"""composite pk for players and coaches

Revision ID: d5e6f7a8b9c0
Revises: c3d4e5f601a2
Create Date: 2026-06-09

"""
from alembic import op

revision = 'd5e6f7a8b9c0'
down_revision = 'c3d4e5f601a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Recreate players with composite PK (id, season_id).
    # Any rows with NULL season_id are assigned to season 1 (WC2022 placeholder).
    op.execute("""
        CREATE TABLE players_new (
            id INTEGER NOT NULL,
            season_id INTEGER NOT NULL DEFAULT 1,
            common_name VARCHAR,
            display_name VARCHAR,
            image_path VARCHAR,
            team_id INTEGER,
            position_id INTEGER,
            jersey_number INTEGER,
            PRIMARY KEY (id, season_id)
        )
    """)
    op.execute("""
        INSERT INTO players_new (id, season_id, common_name, display_name, image_path, team_id, position_id, jersey_number)
        SELECT id, COALESCE(season_id, 1), common_name, display_name, image_path, team_id, position_id, jersey_number
        FROM players
    """)
    op.execute("DROP TABLE players")
    op.execute("ALTER TABLE players_new RENAME TO players")

    # Recreate coaches with composite PK (id, season_id).
    op.execute("""
        CREATE TABLE coaches_new (
            id INTEGER NOT NULL,
            season_id INTEGER NOT NULL DEFAULT 1,
            name VARCHAR,
            display_name VARCHAR,
            image_path VARCHAR,
            team_id INTEGER,
            country_id INTEGER,
            PRIMARY KEY (id, season_id)
        )
    """)
    op.execute("""
        INSERT INTO coaches_new (id, season_id, name, display_name, image_path, team_id, country_id)
        SELECT id, COALESCE(season_id, 1), name, display_name, image_path, team_id, country_id
        FROM coaches
    """)
    op.execute("DROP TABLE coaches")
    op.execute("ALTER TABLE coaches_new RENAME TO coaches")


def downgrade() -> None:
    # Collapse back to single-id PK, keeping only the latest row per player id.
    op.execute("""
        CREATE TABLE players_old (
            id INTEGER NOT NULL,
            season_id INTEGER,
            common_name VARCHAR,
            display_name VARCHAR,
            image_path VARCHAR,
            team_id INTEGER,
            position_id INTEGER,
            jersey_number INTEGER,
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        INSERT INTO players_old
        SELECT id, season_id, common_name, display_name, image_path, team_id, position_id, jersey_number
        FROM players
        GROUP BY id
        HAVING season_id = MAX(season_id)
    """)
    op.execute("DROP TABLE players")
    op.execute("ALTER TABLE players_old RENAME TO players")

    op.execute("""
        CREATE TABLE coaches_old (
            id INTEGER NOT NULL,
            season_id INTEGER,
            name VARCHAR,
            display_name VARCHAR,
            image_path VARCHAR,
            team_id INTEGER,
            country_id INTEGER,
            PRIMARY KEY (id)
        )
    """)
    op.execute("""
        INSERT INTO coaches_old
        SELECT id, season_id, name, display_name, image_path, team_id, country_id
        FROM coaches
        GROUP BY id
        HAVING season_id = MAX(season_id)
    """)
    op.execute("DROP TABLE coaches")
    op.execute("ALTER TABLE coaches_old RENAME TO coaches")

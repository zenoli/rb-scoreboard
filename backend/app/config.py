from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Sportmonks
    sm_api_key: str
    sm_season_id: int = 18017  # WC2022 for dev; WC2026 = 26618

    # Auth
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 1 week

    # Admin
    admin_api_key: str = "change-me-in-production"

    # Database
    database_url: str = "sqlite+aiosqlite:///./scoreboard.db"

    # Sync scheduler
    sync_event_interval_seconds: int = 60
    match_window_before_minutes: int = 30
    match_window_after_minutes: int = 120

    # Scoring defaults
    coach_winner_points: float = 10.0

    # Static frontend files (set by Nix wrapper in production)
    static_dir: str | None = None


settings = Settings()

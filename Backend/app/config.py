from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://visitorhub:change-me@localhost:5432/visitorhub"
    jwt_secret: str = "development-only-change-this-secret-before-deploying"
    access_token_minutes: int = 30
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

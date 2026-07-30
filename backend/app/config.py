from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Owner/service-role Postgres connection (bypasses RLS). Used only by auth flows
    # (username lookups before a household session exists) and admin invite creation.
    database_url: str

    # app_user role connection (FORCE ROW LEVEL SECURITY). Used for every household-scoped
    # request. Falls back to database_url so the app still boots before app_user exists,
    # but that means RLS is not actually enforced until this is set to the real app_user DSN.
    tenant_database_url: str | None = None

    jwt_secret: str
    owner_household_id: str | None = None

    cors_allow_origin: str = "http://localhost:3000"

    session_timeout_seconds: int = 3600
    environment: str = "development"

    @property
    def cookie_secure(self) -> bool:
        return self.environment != "development"

    @property
    def effective_tenant_database_url(self) -> str:
        return self.tenant_database_url or self.database_url


@lru_cache
def get_settings() -> Settings:
    return Settings()

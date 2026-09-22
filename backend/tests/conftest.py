import os

from dotenv import dotenv_values

env_vars = dotenv_values(".env")
if rls_db_url := env_vars.get("RLS_TEST_DATABASE_URL"):
    os.environ["RLS_TEST_DATABASE_URL"] = rls_db_url

from app.core.config import get_settings

os.environ["DATABASE_URL"] = os.environ.get("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/officeos_test")
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_JWT_ISSUER"] = "https://test.supabase.co/auth/v1"
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"

get_settings.cache_clear()
#!/usr/bin/env python
"""
Database initialization script.
Run this after PostgreSQL is up to create all tables and set up extensions.

Usage:
    python scripts/init_db.py

Requires:
    - PostgreSQL running with pgvector extension
    - DATABASE_URL in .env or environment variable
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import text
from src.database import engine, Base
from src.models.user import User
from src.models.session import Session
from src.models.task import Task
from src.models.preference import UserPreference


async def create_tables():
    """Create all tables via SQLAlchemy."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully.")


async def run_init_sql():
    """Run additional DDL from init_db.sql (extensions, indexes)."""
    sql_path = os.path.join(os.path.dirname(__file__), "init_db.sql")
    if not os.path.exists(sql_path):
        print("init_db.sql not found, skipping additional DDL.")
        return

    with open(sql_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # Split into individual statements
    statements = [s.strip() for s in sql_content.split(";") if s.strip()]

    async with engine.begin() as conn:
        for stmt in statements:
            if stmt.startswith("CREATE INDEX") or stmt.startswith("--"):
                continue  # Skip comments and indexes (already created by SQLAlchemy)
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                print(f"Warning: {e}")

    # Try to create vector extension separately (may already exist)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        print("pgvector extension ensured.")
    except Exception as e:
        print(f"Note: {e}")

    print("Additional DDL applied.")


async def main():
    print("Initializing database...")
    await create_tables()
    await run_init_sql()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:3554@localhost:5432/MKUProjectDataBase"
)

# Создаем асинхронный движок
engine = create_async_engine(DATABASE_URL, echo=True)

# Создаем фабрику сессий (без явного указания класса)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False
)

# Функция для получения сессии
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
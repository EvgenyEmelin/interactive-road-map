from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.models import Road, Document
from app.schemas.schemas import RoadCreate, convert_db_geom_to_wkt
from geoalchemy2 import WKTElement


async def get_roads_count(db: AsyncSession) -> int:
    """Получить общее количество дорог"""
    result = await db.execute(select(func.count(Road.id)))
    return result.scalar()


async def get_all_roads(db: AsyncSession):
    """Получить все дороги без ограничений"""
    result = await db.execute(select(Road))
    roads = result.scalars().all()

    # Преобразуем геометрию для ответа
    return [await road_to_dict(road) for road in roads]


async def road_to_dict(db_road):
    """Преобразует объект Road из БД в словарь"""
    if not db_road:
        return None

    return {
        'id': db_road.id,
        'name': db_road.name,
        'geom': convert_db_geom_to_wkt(db_road.geom)
    }


async def create_road(db: AsyncSession, road_in: RoadCreate):
    """Создать дорогу"""
    # Проверяем, что WKT валидный LINESTRING
    if not road_in.geom.startswith('LINESTRING'):
        raise ValueError("Geometry must be a LINESTRING")

    # Проверяем, что есть минимум 2 точки
    if 'EMPTY' in road_in.geom or road_in.geom.count(',') < 1:
        raise ValueError("LINESTRING must have at least 2 points")

    geom = WKTElement(road_in.geom, srid=4326)

    db_road = Road(
        name=road_in.name,
        geom=geom
    )

    db.add(db_road)
    await db.commit()
    await db.refresh(db_road)
    return await road_to_dict(db_road)


async def get_road(db: AsyncSession, road_id: int):
    """Получить дорогу по ID"""
    result = await db.execute(select(Road).where(Road.id == road_id))
    db_road = result.scalar_one_or_none()
    return await road_to_dict(db_road) if db_road else None


async def get_roads(db: AsyncSession, skip: int = 0, limit: int = 100):
    """Получить список дорог с пагинацией"""
    result = await db.execute(select(Road).offset(skip).limit(limit))
    roads = result.scalars().all()
    return [await road_to_dict(road) for road in roads]


async def get_documents_for_road(db: AsyncSession, road_id: int):
    """Получить документы для дороги"""
    result = await db.execute(select(Document).where(Document.road_id == road_id))
    return result.scalars().all()


async def delete_road(db: AsyncSession, road_id: int):
    """Удалить дорогу"""
    result = await db.execute(select(Road).where(Road.id == road_id))
    road = result.scalar_one_or_none()
    if road:
        await db.delete(road)
        await db.commit()
        return await road_to_dict(road)
    return None


async def search_roads(db: AsyncSession, query: str = None, skip: int = 0, limit: int = 100):
    """Поиск дорог по названию"""
    stmt = select(Road)

    if query:
        stmt = stmt.where(Road.name.ilike(f"%{query}%"))

    stmt = stmt.offset(skip).limit(limit)

    result = await db.execute(stmt)
    roads = result.scalars().all()
    return [await road_to_dict(road) for road in roads]


async def update_road(db: AsyncSession, road_id: int, road_data: dict):
    """Обновить информацию о дороге"""
    result = await db.execute(select(Road).where(Road.id == road_id))
    road = result.scalar_one_or_none()

    if not road:
        return None

    # Обновляем поля
    for key, value in road_data.items():
        if hasattr(road, key) and key != 'id':
            if key == 'geom' and value:
                setattr(road, key, WKTElement(value, srid=4326))
            else:
                setattr(road, key, value)

    await db.commit()
    await db.refresh(road)
    return await road_to_dict(road)
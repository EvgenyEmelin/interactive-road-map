from geoalchemy2.functions import ST_GeomFromText
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from app.models.models import Road, Document, Crosswalk
from app.schemas.schemas import RoadCreate, convert_db_geom_to_wkt, CrosswalkCreate, CrosswalkUpdate
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


# Новые функции для работы с документами (упрощенные)
async def create_document(db: AsyncSession, document_data: dict) -> Document:
    """Создать запись о документе в БД"""
    document = Document(**document_data)
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def get_document(db: AsyncSession, document_id: int) -> Document:
    """Получить документ по ID"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    return result.scalar_one_or_none()


async def delete_document(db: AsyncSession, document_id: int) -> bool:
    """Удалить документ"""
    document = await get_document(db, document_id)
    if not document:
        return False

    await db.delete(document)
    await db.commit()
    return True


async def get_crosswalk(db: AsyncSession, crosswalk_id: int):
    # Используем ST_AsText для конвертации геометрии в WKT
    from sqlalchemy import text
    result = await db.execute(
        text("""
            SELECT id, name, description, width, has_traffic_light,
                   near_educational_institution, has_t7, created_at, updated_at,
                   ST_AsText(geom) as geom
            FROM crosswalks 
            WHERE id = :crosswalk_id
        """),
        {"crosswalk_id": crosswalk_id}
    )
    return result.mappings().first()

async def get_crosswalks(db: AsyncSession, skip: int = 0, limit: int = 100):
    # Используем ST_AsText для конвертации геометрии в WKT
    from sqlalchemy import text
    result = await db.execute(
        text("""
            SELECT id, name, description, width, has_traffic_light,
                   near_educational_institution, has_t7, created_at, updated_at,
                   ST_AsText(geom) as geom
            FROM crosswalks 
            ORDER BY id 
            LIMIT :limit OFFSET :skip
        """),
        {"limit": limit, "skip": skip}
    )
    return result.mappings().all()


async def create_crosswalk(db: AsyncSession, crosswalk_in: CrosswalkCreate):
    geom_wkt = crosswalk_in.geom
    if geom_wkt.startswith('POINT'):
        # Можно не проверять дальше, точка всегда валидна
        pass
    elif geom_wkt.startswith('LINESTRING'):
        # Проверяем наличие минимум 2 точек
        if 'EMPTY' in geom_wkt or geom_wkt.count(',') < 1:
            raise ValueError("LINESTRING must have at least 2 points")
    else:
        raise ValueError("Geometry must be a POINT or LINESTRING")

    # Используем только WKTElement
    geom = WKTElement(geom_wkt, srid=4326)

    db_crosswalk = Crosswalk(
        name=crosswalk_in.name,
        description=crosswalk_in.description,
        width=crosswalk_in.width,
        has_traffic_light=crosswalk_in.has_traffic_light,
        near_educational_institution=crosswalk_in.near_educational_institution,
        has_t7=crosswalk_in.has_t7,
        geom=geom,
    )

    db.add(db_crosswalk)
    await db.commit()
    await db.refresh(db_crosswalk)

    # Возвращаем полный объект Crosswalk (не словарь)
    return db_crosswalk

async def update_crosswalk(db: AsyncSession, crosswalk_id: int, crosswalk_in: CrosswalkUpdate):
    result = await db.execute(select(Crosswalk).where(Crosswalk.id == crosswalk_id))
    db_crosswalk = result.scalar_one_or_none()
    if not db_crosswalk:
        return None

    # Обновляем только те поля, что не равны None (partial update)
    if crosswalk_in.name is not None:
        db_crosswalk.name = crosswalk_in.name
    if crosswalk_in.description is not None:
        db_crosswalk.description = crosswalk_in.description
    if crosswalk_in.width is not None:
        db_crosswalk.width = crosswalk_in.width
    if crosswalk_in.has_traffic_light is not None:
        db_crosswalk.has_traffic_light = crosswalk_in.has_traffic_light
    if crosswalk_in.near_educational_institution is not None:
        db_crosswalk.near_educational_institution = crosswalk_in.near_educational_institution
    if crosswalk_in.has_t7 is not None:
        db_crosswalk.has_t7 = crosswalk_in.has_t7
    if crosswalk_in.geom is not None:
        if not crosswalk_in.geom.startswith('LINESTRING'):
            raise ValueError("Geometry must be a LINESTRING")
        if 'EMPTY' in crosswalk_in.geom or crosswalk_in.geom.count(',') < 1:
            raise ValueError("LINESTRING must have at least 2 points")
        db_crosswalk.geom = WKTElement(crosswalk_in.geom, srid=4326)

    await db.commit()
    await db.refresh(db_crosswalk)
    return db_crosswalk

async def delete_crosswalk(db: AsyncSession, crosswalk_id: int):
    result = await db.execute(select(Crosswalk).where(Crosswalk.id == crosswalk_id))
    db_crosswalk = result.scalar_one_or_none()
    if db_crosswalk:
        await db.delete(db_crosswalk)
        await db.commit()
        return True
    return False
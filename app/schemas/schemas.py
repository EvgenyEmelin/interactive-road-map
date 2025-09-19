from typing import List, Optional, Any
from datetime import date
from pydantic import BaseModel, ConfigDict, field_serializer, field_validator
from shapely import wkb
from geoalchemy2 import WKBElement, Geometry
import geoalchemy2


class DocumentBase(BaseModel):
    filename: str
    filepath: str
    creation_date: Optional[date] = None


class DocumentCreate(DocumentBase):
    road_id: int


class Document(DocumentBase):
    id: int
    road_id: int

    model_config = ConfigDict(from_attributes=True)


class RoadBase(BaseModel):
    name: str


class RoadCreate(RoadBase):
    geom: str  # WKT строка geometry


class Road(RoadBase):
    id: int
    geom: str

    model_config = ConfigDict(from_attributes=True)

    @field_validator('geom', mode='before')
    @classmethod
    def convert_geometry_to_wkt(cls, value: Any) -> str:
        """Конвертирует геометрию в WKT строку перед валидацией"""
        if value is None:
            return ""

        # Если это уже строка, возвращаем как есть
        if isinstance(value, str):
            return value

        # Если это WKBElement (из geoalchemy2)
        if isinstance(value, WKBElement):
            try:
                shape = wkb.loads(bytes(value.data))
                return shape.wkt
            except Exception:
                try:
                    # Альтернативный метод через geoalchemy2
                    shape = geoalchemy2.shape.to_shape(value)
                    return shape.wkt
                except Exception as e:
                    return f"Error converting geometry: {str(e)}"

        # Если это объект Geometry
        if hasattr(value, 'desc') and hasattr(value, 'data'):
            try:
                shape = geoalchemy2.shape.to_shape(value)
                return shape.wkt
            except Exception as e:
                return f"Error converting geometry: {str(e)}"

        # Если это bytes
        if isinstance(value, bytes):
            try:
                shape = wkb.loads(value)
                return shape.wkt
            except Exception:
                try:
                    return value.decode('utf-8', errors='ignore')
                except:
                    return str(value)

        # Для любых других типов
        return str(value)


# Отдельная схема для дороги с документами
class RoadWithDocuments(Road):
    documents: List[Document] = []

    model_config = ConfigDict(from_attributes=True)


# Утилитарная функция для преобразования геометрии (можно использовать в crud)
def convert_db_geom_to_wkt(geom) -> str:
    """Конвертирует геометрию из БД в WKT строку"""
    if geom is None:
        return ""

    if isinstance(geom, WKBElement):
        try:
            shape = geoalchemy2.shape.to_shape(geom)
            return shape.wkt
        except Exception:
            try:
                shape = wkb.loads(bytes(geom.data))
                return shape.wkt
            except Exception:
                return str(geom)

    if hasattr(geom, 'data'):
        try:
            shape = geoalchemy2.shape.to_shape(geom)
            return shape.wkt
        except Exception:
            return str(geom)

    return str(geom)


# Схема для ответа API с дополнительными метаданными
class RoadResponse(Road):
    """Схема для ответа API, может содержать дополнительную информацию"""
    pass


# Схема для списка дорог с пагинацией
class RoadsListResponse(BaseModel):
    roads: List[Road]
    total_count: int
    skip: int
    limit: int

    model_config = ConfigDict(from_attributes=True)
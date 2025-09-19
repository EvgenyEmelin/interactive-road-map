from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from typing import List, Optional
from app.schemas.schemas import Road, RoadCreate, Document, RoadWithDocuments, RoadsListResponse, DocumentCreate
from app.db.session import get_db
from app.crud import road_service
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
import os

router = APIRouter()


@router.get("/", response_model=RoadsListResponse)
async def read_roads(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    """
    Получить список дорог с пагинацией
    """
    roads = await road_service.get_roads(db, skip=skip, limit=limit)
    total_count = await road_service.get_roads_count(db)

    return RoadsListResponse(
        roads=roads,
        total_count=total_count,
        skip=skip,
        limit=limit
    )


@router.get("/{road_id}", response_model=Road)
async def read_road(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Получить информацию о конкретной дороге
    """
    road = await road_service.get_road(db, road_id=road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")
    return road


@router.get("/{road_id}/with-documents", response_model=RoadWithDocuments)
async def read_road_with_documents(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Получить дорогу со всеми связанными документами
    """
    road = await road_service.get_road(db, road_id=road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")

    documents = await road_service.get_documents_for_road(db, road_id)

    # Создаем объект RoadWithDocuments
    return RoadWithDocuments(
        id=road['id'],
        name=road['name'],
        geom=road['geom'],
        documents=documents
    )


@router.post("/", response_model=Road)
async def create_road(road_in: RoadCreate, db: AsyncSession = Depends(get_db)):
    """
    Создать новую дорогу
    """
    road = await road_service.create_road(db, road_in)
    return road


@router.get("/{road_id}/documents", response_model=List[Document])
async def read_road_documents(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Получить все документы для конкретной дороги
    """
    documents = await road_service.get_documents_for_road(db, road_id)
    return documents


@router.delete("/{road_id}", response_model=Road)
async def delete_road_endpoint(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Удалить дорогу и все связанные документы
    """
    deleted = await road_service.delete_road(db, road_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Road not found")
    return deleted


@router.get("/search", response_model=List[Road])
async def search_roads_endpoint(
        query: Optional[str] = Query(None, title="Search query", description="Partial road name to search"),
        skip: int = Query(0, ge=0),
        limit: int = Query(100, ge=1, le=100),
        db: AsyncSession = Depends(get_db)
):
    """
    Поиск дорог по названию
    """
    roads = await road_service.search_roads(db, query=query, skip=skip, limit=limit)
    return roads


# Дополнительные эндпоинты для фронтенда
@router.get("/all/basic", response_model=List[Road])
async def get_all_roads_basic(db: AsyncSession = Depends(get_db)):
    """
    Получить все дороги без пагинации (для карты)
    """
    roads = await road_service.get_all_roads(db)
    return roads


@router.get("/{road_id}/basic", response_model=Road)
async def get_road_basic(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Получить базовую информацию о дороге (без документов)
    """
    road = await road_service.get_road(db, road_id=road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")
    return road

#Работа с документами
@router.post("/{road_id}/add-document", response_model=Document)
async def add_document(
    road_id: int,
    filename: str = Form(...),
    file_url: str = Form(...),
    description: Optional[str] = Form(None),
    creation_date: Optional[date] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Добавить ссылку на документ для дороги (поддержка FormData)
    """
    # Проверяем существование дороги
    road = await road_service.get_road(db, road_id=road_id)
    if not road:
        raise HTTPException(status_code=404, detail="Road not found")

    # Создаем запись в БД
    document_data = {
        'road_id': road_id,
        'filename': filename,
        'file_url': file_url,
        'description': description,
        'creation_date': creation_date
    }

    document = await road_service.create_document(db, document_data)
    return document


@router.get("/{road_id}/documents", response_model=List[Document])
async def read_road_documents(road_id: int, db: AsyncSession = Depends(get_db)):
    """
    Получить все документы для конкретной дороги
    """
    documents = await road_service.get_documents_for_road(db, road_id)
    return documents


@router.delete("/documents/{document_id}")
async def delete_document_endpoint(document_id: int, db: AsyncSession = Depends(get_db)):
    """
    Удалить документ
    """
    success = await road_service.delete_document(db, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}
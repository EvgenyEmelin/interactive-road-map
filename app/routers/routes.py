from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from typing import List, Optional
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.schemas import (
    Road,
    RoadCreate,
    Document,
    RoadWithDocuments,
    RoadsListResponse,
    DocumentCreate,
    Crosswalk,
    CrosswalkCreate,
    CrosswalkUpdate,
)
from app.db.session import get_db
from app.crud import road_service

router = APIRouter()

# --- Roads ---

@router.get("/", response_model=RoadsListResponse)
async def read_roads(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    roads = await road_service.get_roads(db, skip=skip, limit=limit)
    total_count = await road_service.get_roads_count(db)
    return RoadsListResponse(
        roads=[Road.from_orm(r) for r in roads],
        total_count=total_count,
        skip=skip,
        limit=limit
    )

@router.get("/{road_id}", response_model=Road)
async def read_road(road_id: int, db: AsyncSession = Depends(get_db)):
    db_road = await road_service.get_road(db, road_id=road_id)
    if not db_road:
        raise HTTPException(status_code=404, detail="Road not found")
    return Road.from_orm(db_road)

@router.get("/{road_id}/with-documents", response_model=RoadWithDocuments)
async def read_road_with_documents(road_id: int, db: AsyncSession = Depends(get_db)):
    db_road = await road_service.get_road(db, road_id=road_id)
    if not db_road:
        raise HTTPException(status_code=404, detail="Road not found")
    documents = await road_service.get_documents_for_road(db, road_id)
    return RoadWithDocuments(
        id=db_road['id'],
        name=db_road['name'],
        geom=db_road['geom'],
        documents=documents
    )

@router.post("/", response_model=Road)
async def create_road(road_in: RoadCreate, db: AsyncSession = Depends(get_db)):
    db_road = await road_service.create_road(db, road_in)
    return Road.from_orm(db_road)

@router.get("/{road_id}/documents", response_model=List[Document])
async def read_road_documents(road_id: int, db: AsyncSession = Depends(get_db)):
    documents = await road_service.get_documents_for_road(db, road_id)
    return documents

@router.delete("/{road_id}", response_model=Road)
async def delete_road_endpoint(road_id: int, db: AsyncSession = Depends(get_db)):
    deleted_road = await road_service.delete_road(db, road_id)
    if not deleted_road:
        raise HTTPException(status_code=404, detail="Road not found")
    # Вернуть удалённый объект
    return Road.parse_obj(deleted_road)  # deleted_road — dict

@router.get("/search", response_model=List[Road])
async def search_roads_endpoint(
    query: Optional[str] = Query(None, title="Search query", description="Partial road name to search"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    roads = await road_service.search_roads(db, query=query, skip=skip, limit=limit)
    return [Road.from_orm(r) for r in roads]

@router.get("/all/basic", response_model=List[Road])
async def get_all_roads_basic(db: AsyncSession = Depends(get_db)):
    roads = await road_service.get_all_roads(db)
    return [Road.from_orm(r) for r in roads]

@router.get("/{road_id}/basic", response_model=Road)
async def get_road_basic(road_id: int, db: AsyncSession = Depends(get_db)):
    db_road = await road_service.get_road(db, road_id=road_id)
    if not db_road:
        raise HTTPException(status_code=404, detail="Road not found")
    return Road.from_orm(db_road)

@router.post("/{road_id}/add-document", response_model=Document)
async def add_document(
    road_id: int,
    filename: str = Form(...),
    file_url: str = Form(...),
    description: Optional[str] = Form(None),
    creation_date: Optional[date] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    db_road = await road_service.get_road(db, road_id=road_id)
    if not db_road:
        raise HTTPException(status_code=404, detail="Road not found")

    document_data = {
        "road_id": road_id,
        "filename": filename,
        "file_url": file_url,
        "description": description,
        "creation_date": creation_date,
    }
    document = await road_service.create_document(db, document_data)
    return document

@router.delete("/documents/{document_id}")
async def delete_document_endpoint(document_id: int, db: AsyncSession = Depends(get_db)):
    success = await road_service.delete_document(db, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"message": "Document deleted successfully"}

# --- Crosswalks ---

@router.get("/crosswalks/", response_model=List[Crosswalk])
async def read_crosswalks(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    crosswalks = await road_service.get_crosswalks(db, skip=skip, limit=limit)
    # Pydantic автоматически преобразует ORM объекты в схему
    return crosswalks

@router.get("/crosswalks/{crosswalk_id}", response_model=Crosswalk)
async def read_crosswalk(crosswalk_id: int, db: AsyncSession = Depends(get_db)):
    db_crosswalk = await road_service.get_crosswalk(db, crosswalk_id=crosswalk_id)
    if db_crosswalk is None:
        raise HTTPException(status_code=404, detail="Crosswalk not found")
    return Crosswalk.from_orm(db_crosswalk)

@router.post("/crosswalks/", response_model=Crosswalk)
async def create_crosswalk(crosswalk: CrosswalkCreate, db: AsyncSession = Depends(get_db)):
    try:
        db_crosswalk = await road_service.create_crosswalk(db=db, crosswalk_in=crosswalk)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Crosswalk.from_orm(db_crosswalk)

@router.put("/crosswalks/{crosswalk_id}", response_model=Crosswalk)
async def update_crosswalk(
    crosswalk_id: int, crosswalk: CrosswalkUpdate, db: AsyncSession = Depends(get_db)
):
    db_crosswalk = await road_service.update_crosswalk(
        db, crosswalk_id=crosswalk_id, crosswalk_in=crosswalk
    )
    if db_crosswalk is None:
        raise HTTPException(status_code=404, detail="Crosswalk not found")
    return Crosswalk.from_orm(db_crosswalk)

@router.delete("/crosswalks/{crosswalk_id}")
async def delete_crosswalk(crosswalk_id: int, db: AsyncSession = Depends(get_db)):
    success = await road_service.delete_crosswalk(db, crosswalk_id=crosswalk_id)
    if not success:
        raise HTTPException(status_code=404, detail="Crosswalk not found")
    return {"message": "Crosswalk deleted successfully"}

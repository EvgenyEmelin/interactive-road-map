from sqlalchemy import Integer, String, Column, ForeignKey, Date, DateTime, Float, Boolean, func
from sqlalchemy.orm import relationship, DeclarativeBase
from geoalchemy2 import Geometry
from datetime import datetime

class Base(DeclarativeBase):
    pass

class Road(Base):
    __tablename__ = 'roads'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    geom = Column(Geometry(geometry_type='LINESTRING', srid=4326), nullable=False)
    documents = relationship('Document', back_populates='road', cascade='all, delete-orphan', lazy="selectin")

class Document(Base):
    __tablename__ = 'documents'
    id = Column(Integer, primary_key=True, index=True)
    road_id = Column(Integer, ForeignKey('roads.id', ondelete='CASCADE'), nullable=False)
    filename = Column(String(255), nullable=False)  # Название документа
    file_url = Column(String, nullable=False)       # Ссылка на PDF в интернете
    description = Column(String(500))               # Описание документа
    creation_date = Column(Date)                    # Дата создания документа
    upload_date = Column(DateTime, default=datetime.utcnow)  # Дата добавления в систему
    road = relationship('Road', back_populates='documents')


class Crosswalk(Base):
    __tablename__ = "crosswalks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    width = Column(Float, nullable=True)
    has_traffic_light = Column(Boolean, default=False)
    near_educational_institution = Column(Boolean, default=False)
    has_t7 = Column(Boolean, default=False)
    geom = Column(Geometry('POINT', srid=4326), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
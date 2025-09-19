from sqlalchemy import Integer, String, Column, ForeignKey, Date
from sqlalchemy.orm import relationship, DeclarativeBase
from geoalchemy2 import Geometry

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
    filename = Column(String(255), nullable=False)
    filepath = Column(String, nullable=False)
    creation_date = Column(Date)
    road = relationship('Road', back_populates='documents')
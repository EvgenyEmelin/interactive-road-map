# 🚦 Interactive Road Map

Интерактивное веб-приложение для управления и визуализации дорожной инфраструктуры, объединяющее мощный backend с асинхронным FastAPI и современный React-фронтенд с интеграцией интерактивных карт.

---

## ✨ Backend Features

- 🛣️ Управление дорогами с произвольной геометрией (LINESTRING)
- 🚶 Создание и редактирование пешеходных переходов (POINT и LINESTRING)
- 📄 Привязка документов к дорогам
- 🔍 Расширенный поиск и фильтрация объектов
- 🌍 Хранение геоданных в PostGIS, поддержка WKT форматов
- ⚡ Асинхронный Python стек с FastAPI и SQLAlchemy Async ORM
- 📦 Миграции Alembic для управления изменениями БД

---

## 🗺️ Frontend Features

### Основные возможности

- Интерактивная двухслойная карта (дороги и пешеходные переходы)
- Real-time рисование объектов на карте и их визуализация
- Автоматическое центрирование на выбранных объектах
- Масштабирование и плавная навигация по карте
- Управление дорожной инфраструктурой через формы с валидацией
- Расширенная фильтрация пешеходных переходов по параметрам
- Подсветка результатов поиска в списках и на карте
- Полностью адаптивный дизайн под мобильные устройства

### Архитектура компонентов (React + React-Leaflet + MUI)

App.jsx
├── MapContainer
│ ├── TileLayer (OpenStreetMap)
│ ├── RoadsLayer (Polyline)
│ ├── CrosswalksLayer (Custom Markers с иконками)
│ └── MapDrawer (Инструмент рисования)
├── Sidebar Panel
│ ├── Формы создания и редактирования
│ ├── Фильтры и поиск
│ └── Списки объектов
└── Dialog System
├── Информационные окна
└── Загрузка PDF-документов

---

## ⚙️ Быстрый старт

### Backend

git clone https://github.com/username/interactive-road-map.git
cd interactive-road-map

python -m venv .venv
source .venv/bin/activate # Linux/macOS
.venv\Scripts\activate # Windows

pip install -r requirements.txt

Настройка БД в app/db/session.py
alembic upgrade head

uvicorn app.main:app --reload

### Frontend

cd frontend
npm install
npm run dev

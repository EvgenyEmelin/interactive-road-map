from fastapi import FastAPI

from app.db.session import engine
from app.routers import routes  # импортируйте ваши роутеры
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Интерактивная карта дорог",
    description="Веб-приложение для отображения дорог с документами",
    version="1.0.0"
)


# Список разрешённых источников для CORS
origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    # другие адреса, если есть
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # используем список
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Включаем роутер дорог с префиксом /roads и тегом для документации
app.include_router(routes.router, prefix="/roads", tags=["Roads"])
app.include_router(routes.router, prefix="/api/v1", tags=["crosswalks"])

@app.get("/")
async def root():
    return {"message": "Добро пожаловать в API Интерактивной карты дорог"}

@app.on_event("startup")
async def startup_event():
    # Можно инициализировать дополнительные объекты или подключения
    pass

@app.on_event("shutdown")
async def shutdown():
    await engine.dispose()

import os
from pathlib import Path


class Settings:
    # Локальное хранилище
    LOCAL_STORAGE_PATH: str = "uploads/documents"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB

    # Разрешенные MIME types
    ALLOWED_MIME_TYPES: list = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
    ]

    def __init__(self):
        # Создаем директорию для локального хранения
        Path(self.LOCAL_STORAGE_PATH).mkdir(parents=True, exist_ok=True)


settings = Settings()
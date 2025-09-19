import os
import shutil
from fastapi import UploadFile, HTTPException
from pathlib import Path
from typing import Optional
import magic  # pip install python-magic-bin

from app.config import settings


class FileService:

    async def save_file(self, file: UploadFile, road_id: int) -> dict:
        """Сохранить файл локально"""
        # Читаем содержимое файла
        contents = await file.read()

        # Проверка размера файла
        if len(contents) > settings.MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large")

        # Определяем MIME type
        mime_type = self._get_mime_type(contents, file.filename)

        # Проверка MIME type
        if mime_type not in settings.ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"File type {mime_type} not allowed")

        # Сохраняем файл
        return await self._save_locally(file.filename, contents, road_id, mime_type)

    async def _save_locally(self, filename: str, contents: bytes, road_id: int, mime_type: str) -> dict:
        """Сохранить файл локально"""
        # Создаем директорию для дороги
        road_dir = Path(settings.LOCAL_STORAGE_PATH) / str(road_id)
        road_dir.mkdir(exist_ok=True)

        # Генерируем уникальное имя файла
        filename = self._generate_unique_filename(road_dir, filename)
        filepath = road_dir / filename

        # Сохраняем файл
        with open(filepath, 'wb') as f:
            f.write(contents)

        return {
            'filename': filename,
            'filepath': str(filepath),
            'file_size': len(contents),
            'mime_type': mime_type
        }

    def _generate_unique_filename(self, directory: Path, filename: str) -> str:
        """Генерирует уникальное имя файла"""
        counter = 1
        name, ext = os.path.splitext(filename)
        new_filename = filename

        while (directory / new_filename).exists():
            new_filename = f"{name}_{counter}{ext}"
            counter += 1

        return new_filename

    def _get_mime_type(self, contents: bytes, filename: str) -> str:
        """Определяет MIME type файла"""
        try:
            # Пытаемся определить по содержимому
            mime = magic.Magic(mime=True)
            mime_type = mime.from_buffer(contents)
            return mime_type
        except:
            # Fallback по расширению файла
            extension = filename.split('.')[-1].lower()
            extension_map = {
                'pdf': 'application/pdf',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'txt': 'text/plain'
            }
            return extension_map.get(extension, 'application/octet-stream')

    def get_file_url(self, document_id: int) -> str:
        """Получить URL для скачивания файла"""
        return f"/api/roads/documents/{document_id}/download"

    def delete_file(self, filepath: str) -> bool:
        """Удалить файл"""
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                return True
            return False
        except:
            return False




file_service = FileService()
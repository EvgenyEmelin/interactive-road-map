import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Paper, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, InputAdornment,
  Chip, Alert, Snackbar
} from '@mui/material';
import { MapContainer, TileLayer, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Фикс для иконок маркеров
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Компонент для управления картой извне
function MapController({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center, zoom || map.getZoom());
    }
  }, [center, zoom, map]);

  return null;
}

// Компонент для рисования дорог
function RoadDrawer({ isDrawing, onPathChange }) {
  const [positions, setPositions] = useState([]);

  useMapEvents({
    click(e) {
      if (!isDrawing) return;
      const newPos = [...positions, [e.latlng.lat, e.latlng.lng]];
      setPositions(newPos);
      onPathChange(newPos);
    },
    contextmenu() {
      if (!isDrawing) return;
      setPositions([]);
      onPathChange([]);
    }
  });

  return positions.length > 0 ? (
    <Polyline positions={positions} color="blue" />
  ) : null;
}

// Компонент для отображения существующих дорог
function RoadsLayer({ roads, onRoadClick }) {
  return roads.map(road => {
    try {
      const coords = parseWKTToCoords(road.geom);
      return (
        <Polyline
          key={road.id}
          positions={coords}
          color="red"
          weight={4}
          eventHandlers={{
            click: () => onRoadClick(road.id)
          }}
        />
      );
    } catch (error) {
      console.error('Error parsing road geometry:', error);
      return null;
    }
  });
}

// Функция для парсинга WKT в координаты
function parseWKTToCoords(wkt) {
  if (!wkt) return [];

  try {
    const match = wkt.match(/LINESTRING\s*\((.+)\)/i);
    if (!match) return [];

    const coordsString = match[1];
    const coordPairs = coordsString.split(',').map(coord => coord.trim());

    return coordPairs.map(pair => {
      const [lng, lat] = pair.split(' ').map(Number);
      return [lat, lng];
    });
  } catch (error) {
    console.error('Error parsing WKT:', error);
    return [];
  }
}

// Функция для вычисления центра дороги
function calculateRoadCenter(coords) {
  if (coords.length === 0) return null;

  const sum = coords.reduce((acc, [lat, lng]) => {
    return [acc[0] + lat, acc[1] + lng];
  }, [0, 0]);

  return [sum[0] / coords.length, sum[1] / coords.length];
}

// Функция для подсветки совпадений в поиске
function highlightSearchMatch(text, query) {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <span key={index} style={{ backgroundColor: '#ffeb3b', fontWeight: 'bold' }}>
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
}

// Главный компонент App
export default function App() {
  const [roads, setRoads] = useState([]);
  const [filteredRoads, setFilteredRoads] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roadName, setRoadName] = useState('');
  const [roadPath, setRoadPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const [mapCenter, setMapCenter] = useState([56.838011, 60.597465]);
  const [mapZoom, setMapZoom] = useState(12);

  // Состояния для загрузки PDF
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfDescription, setPdfDescription] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const mapRef = useRef();

  // Загрузка дорог при монтировании
  useEffect(() => {
    loadRoads();
  }, []);

  // Фильтрация дорог при изменении поискового запроса
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredRoads(roads);
    } else {
      const query = searchQuery.toLowerCase().trim();
      const filtered = roads.filter(road =>
        road.name.toLowerCase().includes(query)
      );
      setFilteredRoads(filtered);
    }
  }, [searchQuery, roads]);

  // Загрузка всех дорог
  const loadRoads = async () => {
    try {
      const response = await fetch('http://localhost:8000/roads/all/basic');
      if (response.ok) {
        const data = await response.json();
        setRoads(data);
        setFilteredRoads(data);
        localStorage.setItem('roads', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error loading roads:', error);
      const savedRoads = localStorage.getItem('roads');
      if (savedRoads) {
        const roadsData = JSON.parse(savedRoads);
        setRoads(roadsData);
        setFilteredRoads(roadsData);
      }
    }
  };

  // Функция для центрирования карты на дороге
  const focusOnRoad = (road) => {
      try {
        const coords = parseWKTToCoords(road.geom);
        if (coords.length > 0) {
          // Вариант 1: Центрируем на середине дороги
          const center = calculateRoadCenter(coords);
          setMapCenter(center);
          setMapZoom(20); // Увеличиваем zoom для лучшего обзора

          // Вариант 2: Подстраиваем viewport под всю дорогу
          // const bounds = calculateRoadBoundingBox(coords);
          // if (mapRef.current) {
          //   mapRef.current.fitBounds(bounds, { padding: [50, 50] });
          // }
        }
      } catch (error) {
        console.error('Error focusing on road:', error);
      }
    };

  // Обработчик клика на дорогу в списке
  const handleRoadListClick = (road) => {
    focusOnRoad(road);
    setSelectedRoad(road);
  };

  // Обработчик клика на дорогу на карте
  const handleRoadMapClick = async (roadId) => {
    try {
      const road = roads.find(r => r.id === roadId);
      if (road) {
        focusOnRoad(road);

        const [roadResponse, docsResponse] = await Promise.all([
          fetch(`http://localhost:8000/roads/${roadId}`),
          fetch(`http://localhost:8000/roads/${roadId}/documents`)
        ]);

        if (roadResponse.ok && docsResponse.ok) {
          const roadDetails = await roadResponse.json();
          const docs = await docsResponse.json();

          setSelectedRoad(roadDetails);
          setDocuments(docs);
          setInfoDialogOpen(true);
        }
      }
    } catch (error) {
      console.error('Error loading road details:', error);
    }
  };

  // Переключение режима рисования
  const toggleDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
    } else {
      setIsDrawing(true);
      setDrawerKey(prev => prev + 1);
    }
  };

  // Сохранение дороги
  const saveRoad = async () => {
    if (!roadName.trim() || roadPath.length < 2) {
      alert('Введите имя и нарисуйте дорогу с минимум двумя точками');
      return;
    }

    const wkt = `LINESTRING (${roadPath.map(point => `${point[1]} ${point[0]}`).join(', ')})`;

    try {
      const response = await fetch('http://localhost:8000/roads/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roadName, geom: wkt }),
      });

      if (response.ok) {
        const newRoad = await response.json();
        setRoads([...roads, newRoad]);
        setRoadName('');
        setRoadPath([]);
        setIsDrawing(false);
        setDrawerKey(prev => prev + 1);
        alert('Дорога успешно сохранена!');
        loadRoads();
      }
    } catch (error) {
      console.error('Error saving road:', error);
      alert('Ошибка при сохранении дороги');
    }
  };

  // Очистка поиска
  const clearSearch = () => {
    setSearchQuery('');
  };

  // Функции для работы с PDF
const handleUploadClick = () => {
  setUploadDialogOpen(true);
  setPdfUrl('');
  setPdfTitle('');
  setPdfDescription(''); // ← СБРАСЫВАЕМ ОПИСАНИЕ
  setUploadError('');
};

const handlePdfUpload = async () => {
  const formData = new FormData();
  formData.append('filename', pdfTitle || 'Документ');
  formData.append('file_url', pdfUrl);
  formData.append('description', pdfDescription);
  formData.append('creation_date', new Date().toISOString().split('T')[0]);

  try {
    const response = await fetch(`http://localhost:8000/roads/${selectedRoad.id}/add-document`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;

      try {
        const errorData = await response.json();
        console.log('Error response from server:', errorData);

        // Обрабатываем разные форматы ошибок от FastAPI
        if (errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            // Ошибки валидации Pydantic
            errorMessage = errorData.detail.map(err =>
              `${err.loc ? err.loc.join('.') + ': ' : ''}${err.msg}`
            ).join(', ');
          } else if (typeof errorData.detail === 'string') {
            // Простая текстовая ошибка
            errorMessage = errorData.detail;
          } else if (typeof errorData.detail === 'object') {
            // Объект ошибки
            errorMessage = JSON.stringify(errorData.detail);
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        console.error('Could not parse error response:', parseError);
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }

      throw new Error(errorMessage);
    }

    const newDocument = await response.json();
    setDocuments([...documents, newDocument]);
    setUploadSuccess('PDF ссылка добавлена!');
    setUploadDialogOpen(false);
    setPdfUrl('');
    setPdfTitle('');

  } catch (error) {
    console.error('Upload error details:', error);
    setUploadError(`Ошибка при добавлении PDF: ${error.message}`);
  }
};


const handleDeleteDocument = async (documentId) => {
  try {
    const response = await fetch(`http://localhost:8000/roads/documents/${documentId}`, {
      method: 'DELETE',
    });

    if (response.ok) {
      setDocuments(documents.filter(doc => doc.id !== documentId));
      setUploadSuccess('Документ удален!');
    } else {
      setUploadError('Ошибка при удалении документа');
    }
  } catch (error) {
    setUploadError('Ошибка при удалении документа');
  }
};

  const closeInfoDialog = () => {
    setInfoDialogOpen(false);
    setSelectedRoad(null);
    setDocuments([]);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Box sx={{ flex: 3 }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController center={mapCenter} zoom={mapZoom} />
          <RoadDrawer
            key={drawerKey}
            isDrawing={isDrawing}
            onPathChange={setRoadPath}
          />

          {roadPath.length > 0 && <Polyline positions={roadPath} color="blue" />}
          <RoadsLayer roads={roads} onRoadClick={handleRoadMapClick} />
        </MapContainer>
      </Box>

      <Paper sx={{ flex: 1, p: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" gutterBottom>
          Создать новую дорогу
        </Typography>
        <TextField
          label="Название дороги"
          fullWidth
          value={roadName}
          onChange={e => setRoadName(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button
          variant={isDrawing ? "contained" : "outlined"}
          onClick={toggleDrawing}
          sx={{ mb: 2 }}
          fullWidth
        >
          {isDrawing ? "Завершить рисование" : "Начать рисование"}
        </Button>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          {isDrawing
            ? "Кликайте по карте для добавления точек. Правый клик сбросит дорогу."
            : "Нажмите 'Начать рисование' чтобы рисовать дорогу на карте."}
        </Typography>
        <Button
          variant="contained"
          fullWidth
          onClick={saveRoad}
          disabled={!roadName || roadPath.length < 2}
          sx={{ mb: 3 }}
        >
          Сохранить дорогу
        </Button>

        <Typography variant="h6" gutterBottom>
          Список дорог ({filteredRoads.length})
          {searchQuery && ` (найдено ${filteredRoads.length} из ${roads.length})`}
        </Typography>

        {/* Поле поиска */}
        <TextField
          placeholder="Поиск по названию дороги..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <span style={{ fontSize: '20px' }}>🔍</span>
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton
                  aria-label="Очистить поиск"
                  onClick={clearSearch}
                  edge="end"
                  size="small"
                >
                  <span style={{ fontSize: '16px' }}>✕</span>
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {filteredRoads.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
              {searchQuery ? (
                <>
                  <Typography variant="body1" gutterBottom>
                    Дороги с названием "{searchQuery}" не найдены
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={clearSearch}
                    size="small"
                  >
                    Показать все дороги
                  </Button>
                </>
              ) : (
                <Typography variant="body1">
                  Нет созданных дорог
                </Typography>
              )}
            </Box>
          ) : (
            <List>
              {filteredRoads.map(road => (
                <ListItem
                  key={road.id}
                  button
                  onClick={() => handleRoadListClick(road)}
                  sx={{
                    borderBottom: '1px solid #eee',
                    backgroundColor: selectedRoad?.id === road.id ? '#e3f2fd' : 'inherit',
                    '&:hover': { backgroundColor: '#f5f5f5' }
                  }}
                >
                  <ListItemText
                    primary={highlightSearchMatch(road.name, searchQuery)}
                    secondary={`ID: ${road.id} • Точек: ${parseWKTToCoords(road.geom).length}`}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      </Paper>

      {/* Диалог с информацией о дороге */}
      <Dialog open={infoDialogOpen} onClose={closeInfoDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">
              {selectedRoad?.name}
            </Typography>
            <IconButton onClick={closeInfoDialog}>
              ✕
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            ID: {selectedRoad?.id}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              Документы ({documents.length})
            </Typography>
            <Button
              variant="outlined"
              onClick={handleUploadClick}
              size="small"
              startIcon={<span>📤</span>}
            >
              Добавить PDF
            </Button>
          </Box>

          {documents.length > 0 ? (
            <List>
              {documents.map(doc => (
                <ListItem
                  key={doc.id}
                  sx={{
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { backgroundColor: '#f5f5f5' }
                  }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: '8px', color: '#1976d2' }}>📄</span>
                        <a
                          href={doc.file_url}  // Измените filepath на file_url
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}
                        >
                          {doc.filename}
                        </a>
                      </Box>
                    }
                    secondary={doc.creation_date ? new Date(doc.creation_date).toLocaleDateString() : 'Дата не указана'}
                  />
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleDeleteDocument(doc.id)}
                    size="small"
                  >
                    <span style={{ color: '#f44336' }}>🗑️</span>
                  </IconButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="textSecondary">
              Нет прикрепленных документов
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInfoDialog}>Закрыть</Button>
          <Button
            onClick={() => selectedRoad && focusOnRoad(selectedRoad)}
            variant="outlined"
          >
            Показать на карте
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог добавления PDF */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
  <DialogTitle>
    <Box display="flex" alignItems="center" justifyContent="space-between">
      <Typography variant="h6">
        Добавить PDF к дороге "{selectedRoad?.name}"
      </Typography>
      <IconButton onClick={() => setUploadDialogOpen(false)}>
        ✕
      </IconButton>
    </Box>
  </DialogTitle>
  <DialogContent>
    <Box sx={{ mt: 2 }}>
      <TextField
        label="Название документа"
        fullWidth
        value={pdfTitle}
        onChange={(e) => setPdfTitle(e.target.value)}
        sx={{ mb: 2 }}
        placeholder="Например: Технический паспорт дороги"
      />
      <TextField
        label="Ссылка на PDF файл"
        fullWidth
        value={pdfUrl}
        onChange={(e) => setPdfUrl(e.target.value)}
        placeholder="https://example.com/document.pdf"
        helperText="Введите прямую ссылку на PDF файл"
        sx={{ mb: 2 }}
      />
      {/* ДОБАВЬТЕ ЭТО ПОЛЕ */}
      <TextField
        label="Описание документа"
        fullWidth
        value={pdfDescription}
        onChange={(e) => setPdfDescription(e.target.value)}
        placeholder="Описание документа (необязательно)"
        multiline
        rows={3}
      />
      {uploadError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {uploadError}
        </Alert>
      )}
    </Box>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => setUploadDialogOpen(false)}>Отмена</Button>
    <Button
      onClick={handlePdfUpload}
      variant="contained"
      disabled={!pdfUrl.trim()}
    >
      Добавить PDF
    </Button>
  </DialogActions>
</Dialog>

      {/* Уведомления */}
      <Snackbar
        open={!!uploadError}
        autoHideDuration={6000}
        onClose={() => setUploadError('')}
      >
        <Alert severity="error" onClose={() => setUploadError('')}>
          {uploadError}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!uploadSuccess}
        autoHideDuration={6000}
        onClose={() => setUploadSuccess('')}
      >
        <Alert severity="success" onClose={() => setUploadSuccess('')}>
          {uploadSuccess}
        </Alert>
      </Snackbar>
    </Box>
  );
}
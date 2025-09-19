import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Paper, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton
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

  // Вычисляем среднюю точку всех координат
  const sum = coords.reduce((acc, [lat, lng]) => {
    return [acc[0] + lat, acc[1] + lng];
  }, [0, 0]);

  return [sum[0] / coords.length, sum[1] / coords.length];
}

// Функция для вычисления bounding box дороги
function calculateRoadBoundingBox(coords) {
  if (coords.length === 0) return null;

  let minLat = coords[0][0];
  let maxLat = coords[0][0];
  let minLng = coords[0][1];
  let maxLng = coords[0][1];

  coords.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  return [[minLat, minLng], [maxLat, maxLng]];
}

// Главный компонент App
export default function App() {
  const [roads, setRoads] = useState([]);
  const [roadName, setRoadName] = useState('');
  const [roadPath, setRoadPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const [mapCenter, setMapCenter] = useState([56.838011, 60.597465]);
  const [mapZoom, setMapZoom] = useState(12);
  const mapRef = useRef();

  // Загрузка дорог при монтировании
  useEffect(() => {
    loadRoads();
  }, []);

  // Загрузка всех дорог
  const loadRoads = async () => {
    try {
      const response = await fetch('http://localhost:8000/roads/all/basic');
      if (response.ok) {
        const data = await response.json();
        setRoads(data);
        localStorage.setItem('roads', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error loading roads:', error);
      const savedRoads = localStorage.getItem('roads');
      if (savedRoads) {
        setRoads(JSON.parse(savedRoads));
      }
    }
  };

  // Функция для центрирования карты на дороге
  const focusOnRoad = (road) => {
    try {
      const coords = parseWKTToCoords(road.geom);
      if (coords.length > 0) {
        // Вариант 1: Центрируем на середине дороги
        //const center = calculateRoadCenter(coords);
        //setMapCenter(center);
        //setMapZoom(14); // Увеличиваем zoom для лучшего обзора

        // Вариант 2: Подстраиваем viewport под всю дорогу
         const bounds = calculateRoadBoundingBox(coords);
         if (mapRef.current) {
           mapRef.current.fitBounds(bounds, { padding: [50, 50] });
         }
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

  // Закрытие диалога информации
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

          {/* Контроллер для управления картой */}
          <MapController center={mapCenter} zoom={mapZoom} />

          {/* Компонент рисования */}
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
          Список дорог ({roads.length})
        </Typography>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          <List>
            {roads.map(road => (
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
                  primary={road.name}
                  secondary={`ID: ${road.id} • Точек: ${parseWKTToCoords(road.geom).length}`}
                />
              </ListItem>
            ))}
          </List>
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

          <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
            Документы ({documents.length})
          </Typography>

          {documents.length > 0 ? (
            <List>
              {documents.map(doc => (
                <ListItem
                  key={doc.id}
                  component="a"
                  href={`http://localhost:8000${doc.filepath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    textDecoration: 'none',
                    color: 'inherit',
                    '&:hover': { backgroundColor: '#f5f5f5' }
                  }}
                >
                  <span style={{ marginRight: '8px', color: '#1976d2' }}>📄</span>
                  <ListItemText
                    primary={doc.filename}
                    secondary={doc.creation_date ? new Date(doc.creation_date).toLocaleDateString() : 'Дата не указана'}
                  />
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
    </Box>
  );
}
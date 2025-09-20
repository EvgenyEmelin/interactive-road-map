import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Button, TextField, Paper, List, ListItem, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, InputAdornment,
  Chip, Alert, Snackbar, Switch, FormControlLabel, Menu, MenuItem,Checkbox,
} from '@mui/material';
import { MapContainer, TileLayer, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ZoomControl } from 'react-leaflet';
import { Marker, Popup } from 'react-leaflet';

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

// Компонент для рисования
function MapDrawer({ isDrawing, onPathChange, drawingMode }) {
  const [positions, setPositions] = useState([]);

  useMapEvents({
    click(e) {
      if (!isDrawing) return;

      if (drawingMode === 'roads') {
        // Для дорог добавляем точки в линию
        const newPos = [...positions, [e.latlng.lat, e.latlng.lng]];
        setPositions(newPos);
        onPathChange(newPos);
      } else if (drawingMode === 'crosswalks') {
        // Для переходов используем только одну точку
        const newPos = [[e.latlng.lat, e.latlng.lng]];
        setPositions(newPos);
        onPathChange(newPos);
      }
    },
    contextmenu() {
      if (!isDrawing) return;
      setPositions([]);
      onPathChange([]);
    }
  });

  return positions.length > 0 ? (
    drawingMode === 'roads' ? (
      <Polyline positions={positions} color="blue" />
    ) : (
      <Marker
        position={positions[0]}
        icon={createCrosswalkIcon(false, false)}
      />
    )
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
    // Для LINESTRING
    const lineMatch = wkt.match(/LINESTRING\s*\((.+)\)/i);
    if (lineMatch) {
      const coordsString = lineMatch[1];
      const coordPairs = coordsString.split(',').map(coord => coord.trim());
      return coordPairs.map(pair => {
        const [lng, lat] = pair.split(' ').map(Number);
        return [lat, lng];
      });
    }

    // Для POINT
    const pointMatch = wkt.match(/POINT\s*\((.+)\)/i);
    if (pointMatch) {
      const coordsString = pointMatch[1];
      const [lng, lat] = coordsString.split(' ').map(Number);
      return [[lat, lng]];
    }

    return [];
  } catch (error) {
    console.error('Error parsing WKT:', error);
    return [];
  }
}

// Функция для парсинга GeoJSON или PostGIS геометрии
function parseGeometry(geom) {
  if (!geom) return [];

  try {
    // Если это WKT строка
    if (typeof geom === 'string') {
      // Для LINESTRING
      const lineMatch = geom.match(/LINESTRING\s*\((.+)\)/i);
      if (lineMatch) {
        const coordsString = lineMatch[1];
        const coordPairs = coordsString.split(',').map(coord => coord.trim());
        return coordPairs.map(pair => {
          const [lng, lat] = pair.split(' ').map(Number);
          return [lat, lng];
        });
      }
      // Для POINT
      const pointMatch = geom.match(/POINT\s*\((.+)\)/i);
        if (pointMatch) {
        const coordsString = pointMatch[1];
        const [lng, lat] = coordsString.split(' ').map(Number);
        return [[lat, lng]];
        }
    }

    // Если это GeoJSON объект
    if (typeof geom === 'object') {
      if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
        const [lng, lat] = geom.coordinates;
        return [[lat, lng]];
      }
      if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
        return geom.coordinates.map(([lng, lat]) => [lat, lng]);
      }
    }

    return [];
  } catch (error) {
    console.error('Error parsing geometry:', error, geom);
    return [];
  }
}

// Функция для вычисления центра
function calculateCenter(coords) {
  if (coords.length === 0) return null;

  if (coords.length === 1) {
    return coords[0]; // Для точки возвращаем саму точку
  }

  const sum = coords.reduce((acc, [lat, lng]) => {
    return [acc[0] + lat, acc[1] + lng];
  }, [0, 0]);

  return [sum[0] / coords.length, sum[1] / coords.length];
}

const focusOnObject = (object) => {
  try {
    const coords = parseGeometry(object.geom);
    if (coords.length > 0) {
      const center = calculateCenter(coords);
      setMapCenter(center);
      setMapZoom(18); // Увеличиваем zoom для лучшего обзора перехода
      console.log('Focused on:', object.name, 'at:', center);
    }
  } catch (error) {
    console.error('Error focusing on object:', error, object);
  }
};

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

// Создаем кастомную иконку для пешеходного перехода
const createCrosswalkIcon = (hasTrafficLight, nearEducationalInstitution) => {
  const iconUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/RU_road_sign_5.19.2.svg/1200px-RU_road_sign_5.19.2.svg.png';

  return L.icon({
    iconUrl: iconUrl,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

// Компонент для отображения пешеходных переходов на карте
function CrosswalksLayer({ crosswalks, onCrosswalkClick }) {
    console.log('Crosswalks data:', crosswalks);
  return crosswalks.map(crosswalk => {
      console.log('Crosswalk geometry:', crosswalk.id, crosswalk.geom);
    try {
      const coords = parseGeometry(crosswalk.geom);
      if (coords.length === 0) {
        console.warn('No coordinates for crosswalk:', crosswalk.id);
        return null;
      }

      const signPosition = coords[0];

      return (
        <Marker
          key={crosswalk.id}
          position={signPosition}
          icon={createCrosswalkIcon(crosswalk.has_traffic_light, crosswalk.near_educational_institution)}
          eventHandlers={{
            click: () => onCrosswalkClick(crosswalk)
          }}
        >
          <Popup>
            <Typography variant="subtitle2">{crosswalk.name}</Typography>
            <Typography variant="body2">
              Ширина: {crosswalk.width}м
              <br />
              {crosswalk.has_traffic_light ? 'Со светофором' : 'Без светофора'}
              <br />
              {crosswalk.near_educational_institution ? 'У образовательного учреждения' : 'Не у образовательного учреждения'}
              <br />
              {crosswalk.has_t7 ? 'Имеется Т7' : 'Нет Т7'}
            </Typography>
          </Popup>
        </Marker>
      );
    } catch (error) {
      console.error('Error parsing crosswalk geometry:', error, crosswalk);
      return null;
    }
  });
}

// Главный компонент App
export default function App() {
  const [roads, setRoads] = useState([]);
  const [filteredRoads, setFilteredRoads] = useState([]);
  const [filteredCrosswalks, setFilteredCrosswalks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roadName, setRoadName] = useState('');
  const [roadPath, setRoadPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedRoad, setSelectedRoad] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [drawerKey, setDrawerKey] = useState(0);
  const [drawingMode, setDrawingMode] = useState('roads');
  const [mapCenter, setMapCenter] = useState([56.838011, 60.597465]);
  const [mapZoom, setMapZoom] = useState(12);
  const [filters, setFilters] = useState({
  hasTrafficLight: false,
  nearEducationalInstitution: false,
  hasT7: false
  });

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfDescription, setPdfDescription] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [activeSection, setActiveSection] = useState('roads');
  const [crosswalks, setCrosswalks] = useState([]);
  const [isAddingCrosswalk, setIsAddingCrosswalk] = useState(false);
  const [crosswalkPath, setCrosswalkPath] = useState([]);
  const [crosswalkInfo, setCrosswalkInfo] = useState({
    name: '',
    description: '',
    width: '',
    has_traffic_light: false,
    near_educational_institution: false,
    has_t7: false
  });

  const mapRef = useRef();
  const menuOpen = Boolean(menuAnchorEl);

  // Загрузка дорог при монтировании
  useEffect(() => {
    loadRoads();
  }, []);

  // Фильтрация при изменении поискового запроса или данных
  useEffect(() => {
  if (activeSection === 'roads') {
    setIsAddingCrosswalk(false);
    setCrosswalkPath([]);
    setFilters({  // Сбрасываем фильтры
      hasTrafficLight: false,
      nearEducationalInstitution: false,
      hasT7: false
    });
  } else if (activeSection === 'crosswalks') {
    setIsDrawing(false);
    setRoadPath([]);
    loadCrosswalks();
    setFilters({  // Сбрасываем фильтры
      hasTrafficLight: false,
      nearEducationalInstitution: false,
      hasT7: false
    });
  }
}, [activeSection]);;

  // Сброс фильтра при смене секции
  useEffect(() => {
    if (activeSection === 'roads') {
      setFilteredRoads(roads);
    } else if (activeSection === 'crosswalks') {
      setFilteredCrosswalks(crosswalks);
    }
  }, [activeSection, roads, crosswalks]);

  // При смене секции сбрасываем все режимы рисования и загружаем данные
  useEffect(() => {
    if (activeSection === 'roads') {
      setIsAddingCrosswalk(false);
      setCrosswalkPath([]);
    } else if (activeSection === 'crosswalks') {
      setIsDrawing(false);
      setRoadPath([]);
      loadCrosswalks(); // ЗАГРУЖАЕМ ПЕРЕХОДЫ ПРИ ОТКРЫТИИ ВКЛАДКИ
    }
  }, [activeSection]);
//Для фильтров
useEffect(() => {
  const query = searchQuery.toLowerCase().trim();

  if (activeSection === 'roads') {
    if (query === '') {
      setFilteredRoads(roads);
    } else {
      const filtered = roads.filter(road =>
        road.name.toLowerCase().includes(query)
      );
      setFilteredRoads(filtered);
    }
  } else if (activeSection === 'crosswalks') {
    let filtered = crosswalks;

    // Применяем фильтры
    if (filters.hasTrafficLight) {
      filtered = filtered.filter(crosswalk => crosswalk.has_traffic_light);
    }
    if (filters.nearEducationalInstitution) {
      filtered = filtered.filter(crosswalk => crosswalk.near_educational_institution);
    }
    if (filters.hasT7) {
      filtered = filtered.filter(crosswalk => crosswalk.has_t7);
    }

    // Применяем текстовый поиск
    if (query !== '') {
      filtered = filtered.filter(crosswalk =>
        crosswalk.name.toLowerCase().includes(query)
      );
    }

    setFilteredCrosswalks(filtered);
  }
}, [searchQuery, roads, crosswalks, activeSection, filters]);

//Сброс фильтров
useEffect(() => {
  if (activeSection === 'roads') {
    setIsAddingCrosswalk(false);
    setCrosswalkPath([]);
    setFilters({  // Сбрасываем фильтры
      hasTrafficLight: false,
      nearEducationalInstitution: false,
      hasT7: false
    });
  } else if (activeSection === 'crosswalks') {
    setIsDrawing(false);
    setRoadPath([]);
    loadCrosswalks();
    setFilters({  // Сбрасываем фильтры
      hasTrafficLight: false,
      nearEducationalInstitution: false,
      hasT7: false
    });
  }
}, [activeSection]);

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

  // Загрузка пешеходных переходов
  const loadCrosswalks = async () => {
  try {
    console.log('Loading crosswalks...');
    const response = await fetch('http://localhost:8000/api/v1/crosswalks/');
    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Crosswalks data received:', data);
    console.log('Number of crosswalks:', data.length);

    if (data.length > 0) {
      console.log('First crosswalk sample:', data[0]);
      console.log('Geometry of first crosswalk:', data[0].geom);
    }

    if (response.ok) {
      setCrosswalks(data);
      setFilteredCrosswalks(data);
    } else {
      console.error('Failed to load crosswalks:', response.status);
    }
  } catch (error) {
    console.error('Error loading crosswalks:', error);
  }
};

  // Функция для центрирования карты на объекте
  const focusOnObject = (object) => {
    try {
      const coords = parseGeometry(object.geom);
      if (coords.length > 0) {
        const center = calculateCenter(coords);
        setMapCenter(center);
        setMapZoom(18); // Увеличиваем zoom для лучшего обзора перехода
        console.log('Focused on:', object.name, 'at:', center);
      }
    } catch (error) {
      console.error('Error focusing on object:', error, object);
    }
  };

  // Обработчик клика на дорогу в списке
  const handleRoadListClick = (road) => {
    focusOnObject(road);
    setSelectedRoad(road);
  };

  // Обработчик клика на переход в списке
  const handleCrosswalkListClick = (crosswalk) => {
  focusOnObject(crosswalk);
  console.log('Crosswalk clicked:', crosswalk);
};

  // Обработчик клика на дорогу на карте
  const handleRoadMapClick = async (roadId) => {
    try {
      const road = roads.find(r => r.id === roadId);
      if (road) {
        focusOnObject(road);

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

  // Обработчик клика на переход на карте
  const handleCrosswalkMapClick = (crosswalk) => {
    focusOnObject(crosswalk);
    console.log('Crosswalk on map clicked:', crosswalk);
  };

  // Переключение режима рисования дорог
  const toggleDrawing = () => {
    if (isDrawing && drawingMode === 'roads') {
      setIsDrawing(false);
      setRoadPath([]);
    } else {
      setIsDrawing(true);
      setDrawingMode('roads');
      setRoadPath([]);
      setDrawerKey(prev => prev + 1);
    }
  };

  // Переключение режима рисования переходов
  const toggleCrosswalkDrawing = () => {
    if (isAddingCrosswalk && drawingMode === 'crosswalks') {
      setIsAddingCrosswalk(false);
      setCrosswalkPath([]);
    } else {
      setIsAddingCrosswalk(true);
      setDrawingMode('crosswalks');
      setCrosswalkPath([]);
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

  // Сохранение пешеходного перехода
  const saveCrosswalk = async () => {
    if (crosswalkPath.length === 0) {
      alert('Нажмите на карте чтобы разместить пешеходный переход');
      return;
    }

    const position = crosswalkPath[0];
    const wkt = `POINT (${position[1]} ${position[0]})`;

    try {
      const response = await fetch('http://localhost:8000/api/v1/crosswalks/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: crosswalkInfo.name,
          description: crosswalkInfo.description,
          width: parseFloat(crosswalkInfo.width),
          has_traffic_light: crosswalkInfo.has_traffic_light,
          near_educational_institution: crosswalkInfo.near_educational_institution,
          has_t7: crosswalkInfo.has_t7,
          geom: wkt
        }),
      });

      if (response.ok) {
        const newCrosswalk = await response.json();
        setCrosswalks([...crosswalks, newCrosswalk]);
        setFilteredCrosswalks([...crosswalks, newCrosswalk]);
        setCrosswalkPath([]);
        setIsAddingCrosswalk(false);
        setCrosswalkInfo({
          name: '',
          description: '',
          width: '',
          has_traffic_light: false,
          near_educational_institution: false,
          has_t7: false
        });
        alert('Пешеходный переход сохранен!');
      } else {
        alert('Ошибка при сохранении перехода');
      }
    } catch (error) {
      console.error('Error saving crosswalk:', error);
      alert('Ошибка при сохранении перехода');
    }
  };

  // Очистка поиска
  const clearSearch = () => {
    setSearchQuery('');
  };

const handleFilterChange = (filterName) => {
  setFilters(prev => ({
    ...prev,
    [filterName]: !prev[filterName]
  }));
};

  // Функции для работы с PDF
  const handleUploadClick = () => {
    setUploadDialogOpen(true);
    setPdfUrl('');
    setPdfTitle('');
    setPdfDescription('');
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
          if (errorData.detail) {
            errorMessage = Array.isArray(errorData.detail)
              ? errorData.detail.map(err => `${err.loc ? err.loc.join('.') + ': ' : ''}${err.msg}`).join(', ')
              : errorData.detail;
          }
        } catch (parseError) {
          console.error('Could not parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const newDocument = await response.json();
      setDocuments([...documents, newDocument]);
      setUploadSuccess('PDF ссылка добавлена!');
      setUploadDialogOpen(false);
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

  // Обработчики меню
  const handleMenuOpen = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleMenuSelect = (section) => {
    setActiveSection(section);
    handleMenuClose();
  };

return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <IconButton
        sx={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
          backgroundColor: 'white',
          '&:hover': { backgroundColor: '#f5f5f5' }
        }}
        onClick={handleMenuOpen}
      >
        <span style={{ fontSize: '24px' }}>☰</span>
      </IconButton>

      <Menu anchorEl={menuAnchorEl} open={menuOpen} onClose={handleMenuClose}>
        <MenuItem onClick={() => handleMenuSelect('roads')} selected={activeSection === 'roads'}>
          🚗 Дороги
        </MenuItem>
        <MenuItem onClick={() => handleMenuSelect('crosswalks')} selected={activeSection === 'crosswalks'}>
          🚶 Пешеходные переходы
        </MenuItem>
        <MenuItem disabled>🚦 Светофоры (скоро)</MenuItem>
      </Menu>

      <Box sx={{ flex: 3 }}>
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ZoomControl position="topright" />
          <MapController center={mapCenter} zoom={mapZoom} />

          {/* Дороги */}
          {activeSection === 'roads' && (
            <>
              {roadPath.length > 0 && <Polyline positions={roadPath} color="blue" />}
              <RoadsLayer roads={filteredRoads} onRoadClick={handleRoadMapClick} />
            </>
          )}

          {/* Пешеходные переходы */}
          {activeSection === 'crosswalks' && (
            <>
              <CrosswalksLayer
                crosswalks={filteredCrosswalks}
                onCrosswalkClick={handleCrosswalkMapClick}
              />
              {isAddingCrosswalk && crosswalkPath.length > 0 && (
                <Marker
                  position={crosswalkPath[0]}
                  icon={createCrosswalkIcon(
                    crosswalkInfo.has_traffic_light,
                    crosswalkInfo.near_educational_institution
                  )}
                />
              )}
            </>
          )}

          {/* Общий рисовальщик */}
          <MapDrawer
            key={`drawer-${drawerKey}`}
            isDrawing={isDrawing || isAddingCrosswalk}
            onPathChange={drawingMode === 'roads' ? setRoadPath : setCrosswalkPath}
            drawingMode={drawingMode}
          />
        </MapContainer>
      </Box>

      <Paper sx={{ flex: 1, p: 2, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" gutterBottom>
          {activeSection === 'roads' ? 'Создать новую дорогу' : 'Создать пешеходный переход'}
        </Typography>

        {activeSection === 'roads' ? (
          <>
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
          </>
        ) : (
          <>
            <TextField
              label="Название перехода"
              fullWidth
              value={crosswalkInfo.name}
              onChange={e => setCrosswalkInfo({...crosswalkInfo, name: e.target.value})}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Описание"
              fullWidth
              value={crosswalkInfo.description}
              onChange={e => setCrosswalkInfo({...crosswalkInfo, description: e.target.value})}
              sx={{ mb: 2 }}
            />
            <TextField
              label="Ширина (м)"
              fullWidth
              type="number"
              value={crosswalkInfo.width}
              onChange={e => setCrosswalkInfo({...crosswalkInfo, width: e.target.value})}
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={crosswalkInfo.has_traffic_light}
                  onChange={e => setCrosswalkInfo({...crosswalkInfo, has_traffic_light: e.target.checked})}
                />
              }
              label="Регулируемый"
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={crosswalkInfo.near_educational_institution}
                  onChange={e => setCrosswalkInfo({...crosswalkInfo, near_educational_institution: e.target.checked})}
                />
              }
              label="У образовательного учреждения"
              sx={{ mb: 2 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={crosswalkInfo.has_t7}
                  onChange={e => setCrosswalkInfo({...crosswalkInfo, has_t7: e.target.checked})}
                />
              }
              label="Имеется Т7"
              sx={{ mb: 2 }}
            />
            <Button
              variant={isAddingCrosswalk ? "contained" : "outlined"}
              onClick={toggleCrosswalkDrawing}
              sx={{ mb: 2 }}
              fullWidth
            >
              {isAddingCrosswalk ? "Завершить размещение" : "Разместить переход на карте"}
            </Button>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              {isAddingCrosswalk
                ? "Кликайте по карте чтобы разместить знак пешеходного перехода. Правый клик сбросит."
                : "Нажмите чтобы разместить пешеходный переход на карте."}
            </Typography>
            <Button
              variant="contained"
              fullWidth
              onClick={saveCrosswalk}
              disabled={crosswalkPath.length === 0}
              sx={{ mb: 3 }}
            >
              Сохранить переход
            </Button>
          </>
        )}

        <Typography variant="h6" gutterBottom>
          {activeSection === 'roads'
            ? `Список дорог (${filteredRoads.length})`
            : `Список переходов (${filteredCrosswalks.length})`}
          {searchQuery && activeSection === 'roads' && ` (найдено ${filteredRoads.length} из ${roads.length})`}
          {activeSection === 'crosswalks' && (
            <>
              {searchQuery ? ` (найдено ${filteredCrosswalks.length} из ${crosswalks.length})` : ''}
              {(filters.hasTrafficLight || filters.nearEducationalInstitution || filters.hasT7) &&
                ` (отфильтровано: ${filteredCrosswalks.length})`
              }
            </>
          )}
        </Typography>

        <TextField
          placeholder={activeSection === 'roads' ? "Поиск по названию дороги..." : "Поиск по названию перехода..."}
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

        {/* Фильтры для пешеходных переходов */}
        {activeSection === 'crosswalks' && (
          <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.hasTrafficLight}
                  onChange={() => handleFilterChange('hasTrafficLight')}
                  size="small"
                />
              }
              label="Регулируемый"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.nearEducationalInstitution}
                  onChange={() => handleFilterChange('nearEducationalInstitution')}
                  size="small"
                />
              }
              label="У образовательного учреждения"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={filters.hasT7}
                  onChange={() => handleFilterChange('hasT7')}
                  size="small"
                />
              }
              label="Имеется Т7"
            />
            <Button
              variant="outlined"
              size="small"
              onClick={() => setFilters({
                hasTrafficLight: false,
                nearEducationalInstitution: false,
                hasT7: false
              })}
              disabled={!filters.hasTrafficLight && !filters.nearEducationalInstitution && !filters.hasT7}
            >
              Сбросить фильтры
            </Button>
          </Box>
        )}

        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {activeSection === 'roads' ? (
            filteredRoads.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                {searchQuery ? (
                  <>
                    <Typography variant="body1" gutterBottom>
                      Дороги с названием "{searchQuery}" не найдены
                    </Typography>
                    <Button variant="outlined" onClick={clearSearch} size="small">
                      Показать все дороги
                    </Button>
                  </>
                ) : (
                  <Typography variant="body1">Нет созданных дорог</Typography>
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
            )
          ) : (
            filteredCrosswalks.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <Typography variant="body1">
                  Нет созданных пешеходных переходов
                </Typography>
              </Box>
            ) : (
              <List>
                {filteredCrosswalks.map(crosswalk => (
                  <ListItem
                    key={crosswalk.id}
                    onClick={() => handleCrosswalkListClick(crosswalk)}
                    sx={{
                      borderBottom: '1px solid #eee',
                      '&:hover': {
                        backgroundColor: '#f5f5f5',
                        cursor: 'pointer'
                      },
                      textAlign: 'left',
                      color: 'text.primary',
                      backgroundColor: 'background.paper'
                    }}
                  >
                    <ListItemText
                      primary={highlightSearchMatch(crosswalk.name, searchQuery)}
                      secondary={
                        <>
                          Ширина: {crosswalk.width}м •
                          {crosswalk.has_traffic_light ? ' Со светофором' : ' Без светофора'} •
                          {crosswalk.near_educational_institution ? ' У образовательного учреждения' : ' Не у образовательного учреждения'}
                          {crosswalk.has_t7 ? ' Имеется Т7' : ' Нет Т7'}
                        </>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )
          )}
        </Box>
      </Paper>

      {/* Диалог с информацией о дороге */}
      <Dialog open={infoDialogOpen} onClose={closeInfoDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{selectedRoad?.name}</Typography>
            <IconButton onClick={closeInfoDialog}>✕</IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            ID: {selectedRoad?.id}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Документы ({documents.length})</Typography>
            <Button variant="outlined" onClick={handleUploadClick} size="small" startIcon={<span>📤</span>}>
              Добавить PDF
            </Button>
          </Box>

          {documents.length > 0 ? (
            <List>
              {documents.map(doc => (
                <ListItem key={doc.id} sx={{ textDecoration: 'none', color: 'inherit', '&:hover': { backgroundColor: '#f5f5f5' } }}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: '8px', color: '#1976d2' }}>📄</span>
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
                          {doc.filename}
                        </a>
                      </Box>
                    }
                    secondary={doc.creation_date ? new Date(doc.creation_date).toLocaleDateString() : 'Дата не указана'}
                  />
                  <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteDocument(doc.id)} size="small">
                    <span style={{ color: '#f44336' }}>🗑️</span>
                  </IconButton>
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="textSecondary">Нет прикрепленных документов</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInfoDialog}>Закрыть</Button>
          <Button onClick={() => selectedRoad && focusOnObject(selectedRoad)} variant="outlined">
            Показать на карте
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог добавления PDF */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Добавить PDF к дороге "{selectedRoad?.name}"</Typography>
            <IconButton onClick={() => setUploadDialogOpen(false)}>✕</IconButton>
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
              <Alert severity="error" sx={{ mt: 2 }}>{uploadError}</Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>Отмена</Button>
          <Button onClick={handlePdfUpload} variant="contained" disabled={!pdfUrl.trim()}>
            Добавить PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* Уведомления */}
      <Snackbar open={!!uploadError} autoHideDuration={6000} onClose={() => setUploadError('')}>
        <Alert severity="error" onClose={() => setUploadError('')}>{uploadError}</Alert>
      </Snackbar>

      <Snackbar open={!!uploadSuccess} autoHideDuration={6000} onClose={() => setUploadSuccess('')}>
        <Alert severity="success" onClose={() => setUploadSuccess('')}>{uploadSuccess}</Alert>
      </Snackbar>
    </Box>
  );
}
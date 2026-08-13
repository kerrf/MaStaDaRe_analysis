import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, GeoJSON, Marker, Tooltip, useMap, ImageOverlay } from 'react-leaflet';
import L from 'leaflet';
import * as topojson from 'topojson-client';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat/dist/leaflet-heat.js';
import NavBar from '../components/NavBar';

// ============================================================================
// LOGGING UTILITY
// ============================================================================

const Logger = {
  info: (msg, ...args) => console.info(`[MapPage|INFO] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[MapPage|ERROR] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[MapPage|WARN] ${msg}`, ...args)
};

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const ENDPOINTS = {
  PLZ2: '/plz2_boundaries.topojson',
  PLZ3: '/plz3_boundaries.topojson',
  PLZ5: '/plz5_boundaries.topojson',
  BUNDESLAND: '/states_boundaries.topojson',
  STATS: 'http://localhost:8000/solar/dashboard-stats',
  HEATMAP_IMG: 'http://localhost:8000/solar/plz5_heatmap_image'
};

const MAP_BOUNDS = [
  [47.270111, 5.866315],
  [55.058347, 15.041931]
];

const TOP_CITIES = {
  'Berlin': [13.404954, 52.520008], 'Köln': [6.953101, 50.935173], 'Düsseldorf': [6.782048, 51.227144],
  'Frankfurt am Main': [8.682127, 50.110924], 'Hamburg': [9.993682, 53.551086], 'Leipzig': [12.387772, 51.343479],
  'München': [11.576124, 48.137154], 'Dortmund': [7.468554, 51.5134], 'Stuttgart': [9.181332, 48.777128],
  'Nürnberg': [11.077438, 49.44982], 'Hannover': [9.73322, 52.37052],
};

const SIDEBAR_OPTIONS = {
  "Quellen": ["Fraunhofer ISE 2024", "Marktstammdatenregister"],
  "Wert": ["Absolut", "Relativ nach Fläche", "Relativ nach Einwohnerzahl"],
  "Art der Anlage": ["Solar", "Wind Onshore", "Wind Offshore", "Batterien", "Pumpspeicher"],
  "Detailgrad der Regionen": ["Bundesländer", "PLZ-Bereich (2-stellig)", "PLZ-Bereich (3-stellig)", "PLZ-Bereiche", "kontinuierlich"],
  "Diagrammtyp": ["Heatmap", "Balkendiagramm"],
  "Anordnung": ["Standard Layout", "Kompakt"],
  "Konfiguration": ["Farbskala", "Grenzwerte"],
  "Beschreibung": ["Methodik", "Legende"],
  "Export": ["PDF Export", "CSV Export"],
  "Hinweise": ["Datenschutz", "Nutzung"]
};

const CITY_ICON = new L.DivIcon({
  className: 'city-dot',
  html: `<div style="background-color: black; width: 8px; height: 8px; border-radius: 50%; border: 1px solid white;"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
});

// ============================================================================
// STYLES
// ============================================================================

const STYLES = {
  page: { minHeight: '100vh', width: '100%', background: '#fcfcfc' },
  container: { width: '90%', maxWidth: '1450px', margin: '0 auto', padding: '36px 0' },
  topGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '48px', marginBottom: '60px' },
  card: { background: '#fff', padding: '22px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' },
  mainSection: { display: 'flex', gap: '24px', background: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', alignItems: 'flex-start' },
  mapWrapper: { height: '620px', borderRadius: '6px', overflow: 'hidden', position: 'relative' },
  mapTitle: { margin: '0 0 18px 0', fontSize: '24px', color: '#0b4ea2', minHeight: '60px' },
  sidebar: { flex: 1, minWidth: '300px', borderLeft: '1px solid #eee', paddingLeft: '20px' },
  sidebarItemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', border: '1px solid #e0e0e0', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', color: 'black', fontWeight: 500 },
  sidebarItemBody: { padding: '12px', border: '1px solid #e0e0e0', background: '#fff' }
};

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

/**
 * Triggers a layout recalculation on mount to prevent Leaflet's gray-tile rendering bug.
 */
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

/**
 * Disables default scroll zoom, enabling it only when CTRL is pressed.
 */
function ScrollHandler() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    const container = map.getContainer();
    
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        e.deltaY < 0 ? map.zoomIn() : map.zoomOut();
      }
    };
    
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [map]);
  return null;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

/**
 * Renders an accordion-style dropdown for sidebar selections.
 */
const SidebarItem = ({ label, options, isSingleChoice, onSelect, currentSelection }) => {
  const [isOpen, setIsOpen] = useState(false);
  const headerBg = isOpen ? '#f8f9fa' : 'white';

  return (
    <div style={{ marginBottom: '8px', textAlign: 'left' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{ ...STYLES.sidebarItemHeader, background: headerBg }}
      >
        <span>{label}</span>
        <span>▼</span>
      </div>
      {isOpen && options && (
        <div style={STYLES.sidebarItemBody}>
          {options.map((opt, i) => (
            <div key={i} style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input 
                type={isSingleChoice ? "radio" : "checkbox"} 
                name={`group-${label}`}
                checked={isSingleChoice ? currentSelection === opt : undefined}
                onChange={() => onSelect(opt)}
                style={{ cursor: 'pointer' }} 
              />
              <label style={{ fontSize: '13px', color: 'black' }}>{opt}</label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAP COMPONENTS
// ============================================================================

/**
 * Renders a GeoJSON choropleth map layered over canvas.
 */
function SeparateMapCard({ title, geoData, valueKey = "total_power" }) {
  const geoJsonRef = useRef();
  
  // SAFEGUARD: Check if geoData and features exist before mapping
  const values = useMemo(() => geoData?.features ? geoData.features.map(f => f.properties[valueKey] || 0) : [], [geoData, valueKey]);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;

  const getColor = (val) => {
    if (maxValue === minValue) return 'rgb(255, 255, 0)';
    const t = (val - minValue) / (maxValue - minValue);
    if (t < 0.5) return `rgb(255, ${Math.round(255 * (1 - t * 2))}, 0)`;
    return `rgb(${Math.round(255 * (1 - (t - 0.5) * 2))}, 0, 0)`;
  };

  useEffect(() => {
    if (geoData && geoJsonRef.current) {
      geoJsonRef.current.setStyle((feature) => ({
        fillColor: getColor(feature.properties[valueKey] || 0),
        weight: 0.5,
        color: 'black',
        fillOpacity: 0.9
      }));
    }
  }, [geoData, valueKey, maxValue, minValue]);

  const bindFeatureEvents = (feature, layer) => {
    const props = feature.properties;
    const tooltipContent = `
      <div style="text-align: left; font-family: sans-serif; color: #333;">
        <h3 style="margin: 0 0 5px 0; font-size: 16px; border-bottom: 2px solid #0b4ea2; padding-bottom: 2px;">
          Region: ${props.plz || props.name || 'Unbekannt'}
        </h3>
        <div style="font-size: 13px; line-height: 1.4;">
          <strong>Anzahl Anlagen:</strong> ${props.total_units?.toLocaleString() || 0}<br/>
          <strong>Installierte Leistung (kW):</strong> ${props.total_power?.toLocaleString(undefined, {maximumFractionDigits: 2}) || 0}<br/>
        </div>
      </div>
    `;
    
    layer.bindTooltip(tooltipContent, { sticky: true, direction: 'top', opacity: 0.95 });

    layer.on({
        mouseover: (e) => {
          e.target.setStyle({ weight: 3, color: 'white', fillOpacity: 1 });
          e.target.bringToFront();
        },
        mouseout: (e) => {
          e.target.setStyle({ 
            weight: 0.5, 
            color: 'black', 
            fillColor: getColor(e.target.feature.properties[valueKey] || 0) 
          });
      }
    });
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={STYLES.mapTitle}>{title}</h2>
      <div style={{ ...STYLES.mapWrapper, background: '#eee' }}>
        <MapContainer preferCanvas={true} center={[51.1657, 10.4515]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <ResizeFix /> 
          <ScrollHandler />
          
          {/* SAFEGUARD: Only render GeoJSON when data is available */}
          {geoData && (
            <GeoJSON 
              key={`${title}-${maxValue}`}
              ref={geoJsonRef} 
              data={geoData} 
              onEachFeature={bindFeatureEvents}
              style={(feature) => ({
              fillColor: getColor(feature.properties[valueKey] || 0),
              weight: 0.5,
              color: 'black',
              fillOpacity: 0.9
             })}
            />
          )}

          {Object.entries(TOP_CITIES).map(([name, [lng, lat]]) => (
            <Marker key={name} position={[lat, lng]} icon={CITY_ICON} interactive={false}>
              <Tooltip permanent direction="top" offset={[0, -5]} className="city-label">{name}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
        
        {/* OPTIONAL: Show a spinner overlay over the map while waiting */}
        {!geoData && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(238, 238, 238, 0.7)', zIndex: 1000 }}>
             <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Lade Kartendaten...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a static heatmap image overlay bordered by GeoJSON bounds.
 */
function HeatmapMapCard({ title, geoData }) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={STYLES.mapTitle}>{title}</h2>
      <div style={{ ...STYLES.mapWrapper, background: '#fff' }}>
        <MapContainer preferCanvas={true} center={[51.1657, 10.4515]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <ResizeFix /> 
          <ScrollHandler />
          <ImageOverlay url={ENDPOINTS.HEATMAP_IMG} bounds={MAP_BOUNDS} opacity={0.85} />
          <GeoJSON data={geoData} style={{ fillColor: 'transparent', weight: 0.4, color: 'black', fillOpacity: 0 }} />
          {Object.entries(TOP_CITIES).map(([name, [lng, lat]]) => (
            <Marker key={name} position={[lat, lng]} icon={CITY_ICON} interactive={false}>
              <Tooltip permanent direction="top" offset={[0, -5]} className="city-label">{name}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN PAGE VIEW
// ============================================================================

export default function MapPage() {
  const [geoData, setGeoData] = useState(null);
  const [geoData3, setGeoData3] = useState(null);
  const [geoData5, setGeoData5] = useState(null);
  const [geoDataBL, setGeoDataBL] = useState(null);
  
  const [detailLevel, setDetailLevel] = useState("PLZ-Bereiche");
  const [valueType, setValueType] = useState("Absolut");
  const [apiData, setApiData] = useState([]);
  
  // --------------------------------------------------------------------------
  // Data Fetching: Topology
  // --------------------------------------------------------------------------
  useEffect(() => {
      const fetchTopology = async (url, setter) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const topology = await res.json();
          const geojson = topojson.feature(topology, Object.keys(topology.objects)[0]);
          setter(geojson);
        } catch (err) {
          Logger.error(`Failed loading from ${url}`, err);
        }
      };

      fetchTopology(ENDPOINTS.PLZ2, setGeoData);
      fetchTopology(ENDPOINTS.PLZ3, setGeoData3);
      fetchTopology(ENDPOINTS.PLZ5, setGeoData5);
      fetchTopology(ENDPOINTS.BUNDESLAND, setGeoDataBL);
  }, []);
  
  // --------------------------------------------------------------------------
  // Data Fetching: Database Metrics
  // --------------------------------------------------------------------------
  const getApiLevel = (detail) => {
    if (detail === "Bundesländer") return "Bundesland";
    if (detail === "PLZ-Bereich (2-stellig)") return "plz2";
    if (detail === "PLZ-Bereich (3-stellig)") return "plz3";
    return "plz5";
  };

  useEffect(() => {
    if (detailLevel === "kontinuierlich") return; 

    const level = getApiLevel(detailLevel);
    
    fetch(`${ENDPOINTS.STATS}?level=${level}`)
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) Logger.info("API Data Initialized", data[0]); 
        setApiData(data);
      })
      .catch(err => Logger.error("Error fetching stats:", err));
  }, [detailLevel]);

  // --------------------------------------------------------------------------
  // Data Merging
  // --------------------------------------------------------------------------
  const mergedGeoData = useMemo(() => {
    let baseShapes;
        if (detailLevel === "PLZ-Bereiche") baseShapes = geoData5;
        else if (detailLevel === "PLZ-Bereich (3-stellig)") baseShapes = geoData3;
        else if (detailLevel === "Bundesländer") baseShapes = geoDataBL;
        else baseShapes = geoData; // Default for PLZ2 and Bundesland

    if (!baseShapes?.features || !apiData?.length) return baseShapes;

    const levelKey = getApiLevel(detailLevel); 
    const apiDict = apiData.reduce((acc, row) => {
      if (!row) return acc;

      acc[row[levelKey]] = { total_power: row.total_power, total_units: row.total_units };
      return acc;
    }, {});

    return {
      ...baseShapes,
      features: baseShapes.features.map(feature => {
        const matchKey = feature.properties.plz || feature.properties.name; 
        const metrics = apiDict[matchKey] || { total_power: 0, total_units: 0 };
        return {
          ...feature,
          properties: { ...feature.properties, ...metrics }
        };
      })
    };
  }, [geoData, geoData3, geoData5, geoDataBL, apiData, detailLevel]);

  // --------------------------------------------------------------------------
  // Render Helpers
  // --------------------------------------------------------------------------
  const renderDynamicMap = () => {
    const valueMap = {
      "Absolut": "total_power",
      "Relativ nach Fläche": "dichte_leistung_area",
      "Relativ nach Einwohnerzahl": "dichte_leistung_population"
    };
    
    const selectedValueKey = valueMap[valueType] || "total_power";

    switch (detailLevel) {
      case "Bundesländer":
        return <SeparateMapCard title="PV-Leistung nach Bundesländern" geoData={mergedGeoData} valueKey={selectedValueKey} />;
      case "PLZ-Bereich (2-stellig)":
        return <SeparateMapCard title="Relative PV-Leistung, PLZ2 (Leitregion)" geoData={mergedGeoData} valueKey={selectedValueKey} />;
      case "PLZ-Bereiche":
        return <SeparateMapCard title="PV-Leistung nach 5-stelligen PLZ-Bereichen" geoData={mergedGeoData} valueKey={selectedValueKey} />;
      case "kontinuierlich":
        return <HeatmapMapCard title="PV-Leistung Deutschland: Gauß-Heatmap" geoData={geoData} />;
      default:
        return <SeparateMapCard title="Relative PV-Leistung" geoData={mergedGeoData} valueKey={selectedValueKey} />;
    }
  };

  return (
    <div style={STYLES.page}>
      <NavBar />
      <div style={STYLES.container}>

        <div style={STYLES.mainSection}>
          <div style={{ flex: 3 }}>
            {renderDynamicMap()}
          </div>

          <div style={STYLES.sidebar}>
             <div style={{ textAlign: 'right', marginBottom: '10px' }}>
               <span style={{ color: 'black', fontSize: '24px', cursor: 'pointer' }}>ⓧ</span>
             </div>
             
             {Object.keys(SIDEBAR_OPTIONS).map(label => {
               const isSingle = ["Detailgrad der Regionen", "Wert"].includes(label);
               const currentVal = label === "Detailgrad der Regionen" ? detailLevel : (label === "Wert" ? valueType : undefined);
               
               return (
                 <SidebarItem 
                    key={label} 
                    label={label} 
                    options={SIDEBAR_OPTIONS[label]} 
                    isSingleChoice={isSingle} 
                    currentSelection={currentVal}
                    onSelect={(opt) => {
                      if (label === "Detailgrad der Regionen") setDetailLevel(opt);
                      else if (label === "Wert") setValueType(opt);
                    }}
                 />
               );
             })}
          </div>
        </div>

      </div>
    </div>
  );
}
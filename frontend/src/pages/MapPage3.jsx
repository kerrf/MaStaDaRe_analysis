import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, GeoJSON, Marker, Tooltip, useMap, ImageOverlay } from 'react-leaflet';
import L from 'leaflet';
import * as topojson from 'topojson-client';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat/dist/leaflet-heat.js';
import NavBar from '../components/NavBar';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const ENDPOINTS = {
  PLZ2: '/plz2_boundaries.topojson',
  PLZ3: '/plz3_boundaries.topojson',
  PLZ5: '/plz5_boundaries.topojson',
  BUNDESLAND: '/states_boundaries.topojson',
  STATS: `${API_BASE_URL}/solar/dashboard-stats`,
  HEATMAP_IMG: `${API_BASE_URL}/plz5_heatmap_image`
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
  "Wert": ["Absolut", "Relativ nach Fläche", "Relativ nach Einwohnerzahl"],
  "Art der Anlage": ["Solar", "Wind Onshore", "Wind Offshore", "Batterien", "Pumpspeicher"],
  "Detailgrad der Regionen": ["Bundesländer", "PLZ-Bereich (2-stellig)", "PLZ-Bereich (3-stellig)", "PLZ-Bereiche", "kontinuierlich"],
  "Anordnung": ["Standard Layout", "Kompakt"],
  "Beschreibung": ["Methodik", "Legende"],
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
  mainSection: { display: 'flex', gap: '24px', alignItems: 'flex-start' },
  
  mapCard: { flex: 3, background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  mapTitle: { margin: 0, padding: '14px 16px', fontSize: '15px', fontWeight: '600', color: '#333', textAlign: 'left', background: '#f5f5f5', borderBottom: '1px solid #e0e0e0' },
  mapWrapper: { height: '620px', borderRadius: '6px', overflow: 'hidden', position: 'relative' },
  
  sidebar: { flex: 1, minWidth: '300px', background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' },
  sidebarHeader: { background: '#f5f5f5', padding: '14px 16px', fontSize: '15px', fontWeight: '600', color: '#333', borderBottom: '1px solid #e0e0e0', textAlign: 'left' },
  sidebarBody: { padding: '16px' },
  sidebarItem: { marginBottom: '18px', textAlign: 'left' },
  sidebarLabel: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '6px' },
  sidebarSelect: { 
    width: '100%', 
    padding: '8px 30px 8px 12px', 
    borderRadius: '4px', 
    border: '1px solid #ccc', 
    fontSize: '13px', 
    background: '#fff', 
    color: 'black', 
    cursor: 'pointer', 
    outline: 'none',
    appearance: 'none', 
    WebkitAppearance: 'none', 
    MozAppearance: 'none',
    backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="black" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 4px center'
  }
};

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

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

const SidebarItem = ({ label, options, currentSelection, onSelect }) => {
  return (
    <div style={STYLES.sidebarItem}>
      <label style={STYLES.sidebarLabel}>{label}</label>
      <select 
        value={currentSelection || options[0]}
        onChange={(e) => onSelect(e.target.value)}
        style={STYLES.sidebarSelect}
      >
        {options.map((opt, i) => (
          <option key={i} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
};

// ============================================================================
// MAP COMPONENTS
// ============================================================================

function SeparateMapCard({ title, geoData, valueKey = "total_power", isLoading}) {
  const geoJsonRef = useRef();
  
  const values = useMemo(() => geoData?.features ? geoData.features.map(f => f.properties[valueKey] || 0) : [], [geoData, valueKey]);
  const minValue = 0;
  const maxValue = values.length ? Math.max(...values) : 0;

  const getColor = (val) => {
    if (maxValue === minValue || maxValue === 0) return 'rgb(26, 152, 80)';
    const t = (val - 0) / (maxValue - 0);
    
    const stops = [
      [26, 152, 80],   
      [166, 217, 106], 
      [255, 255, 191], 
      [253, 141, 60],  
      [215, 48, 39]    
    ];
    
    if (t >= 1) return `rgb(${stops[4].join(',')})`;
    if (t <= 0) return `rgb(${stops[0].join(',')})`;
    
    const i = Math.floor(t * 4);
    const f = (t * 4) - i;
    const c1 = stops[i], c2 = stops[i + 1];
    
    return `rgb(${Math.round(c1[0] + f * (c2[0] - c1[0]))}, ${Math.round(c1[1] + f * (c2[1] - c1[1]))}, ${Math.round(c1[2] + f * (c2[2] - c1[2]))})`;
  };

  useEffect(() => {
    if (geoData && geoJsonRef.current) {
      geoJsonRef.current.setStyle((feature) => ({
        fillColor: getColor(feature.properties[valueKey] || 0),
        weight: 0.5,
        color: 'grey',
        fillOpacity: 0.9
      }));
    }
  }, [geoData, valueKey, maxValue]);

  const bindFeatureEvents = (feature, layer) => {
    const props = feature.properties;
  const tooltipContent = `
      <div style="text-align: left; font-family: sans-serif; color: #333; min-width: 250px;">
        <h3 style="margin: 0 0 8px 0; font-size: 15px; border-bottom: 2px solid #0b4ea2; padding-bottom: 4px;">
          Region: ${props.plz || props.name || 'Unbekannt'}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tbody>
            <tr style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 1px 0; font-weight: 600; color: #444;">Anlagen</td>
              <td style="padding: 1px 8px; text-align: right; font-family: monospace; font-size: 12px;">${props.total_units?.toLocaleString() || 0}</td>
              <td style="padding: 1px 0; color: #888; width: 60px;"></td>
            </tr>
            <tr style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 1px 0; font-weight: 600; color: #444;">Absolut</td>
              <td style="padding: 1px 8px; text-align: right; font-family: monospace; font-size: 12px;">${props.total_power?.toLocaleString(undefined, {maximumFractionDigits: 2}) || 0}</td>
              <td style="padding: 1px 0; color: #888; width: 60px;">MWp</td>
            </tr>
            <tr style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 1px 0; font-weight: 600; color: #444;">Pro Fläche</td>
              <td style="padding: 1px 8px; text-align: right; font-family: monospace; font-size: 12px;">${props.relative_area_power?.toLocaleString(undefined, {maximumFractionDigits: 4}) || 0}</td>
              <td style="padding: 1px 0; color: #888; width: 60px;">kWp/km²</td>
            </tr>
            <tr>
              <td style="padding: 1px 0; font-weight: 600; color: #444;">Pro Einw.</td>
              <td style="padding: 1px 8px; text-align: right; font-family: monospace; font-size: 12px;">${props.relative_population_power?.toLocaleString(undefined, {maximumFractionDigits: 6})|| 0}</td>
              <td style="padding: 1px 0; color: #888; width: 60px;">kWp</td>
            </tr>
          </tbody>
        </table>
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
            weight: 0.2, 
            color: '#888', 
            fillColor: getColor(e.target.feature.properties[valueKey] || 0) 
          });
      }
    });
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={STYLES.mapTitle}>{title}</h2>
      
      <div style={{ padding: '16px' }}>
        <div id="map-export-container" style={{ ...STYLES.mapWrapper, background: '#fff' }}>
          
          <MapContainer preferCanvas={true} center={[51.1657, 10.4515]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
            <ResizeFix /> 
            <ScrollHandler />
            
            {geoData && (
              <GeoJSON 
                key={`${title}-${valueKey}`}
                ref={geoJsonRef} 
                data={geoData} 
                onEachFeature={bindFeatureEvents}
                style={(feature) => ({
                  fillColor: getColor(feature.properties[valueKey] || 0),
                  weight: 0.2,       
                  color: '#888',     
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
          
          <div style={{
            position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000,
            background: 'rgba(255, 255, 255, 0.95)', padding: '12px', borderRadius: '8px',
            boxShadow: '0 2px 6px rgba(0,0,0,0.2)', width: '260px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
              {valueKey === 'total_power' ? 'Leistung absolut (MWp)' : 
               valueKey === 'relative_area_power' ? 'Leistung / Fläche' : 'Leistung / Einwohner'}
            </div>
            <div style={{
              height: '14px', width: '100%', borderRadius: '4px',
              background: 'linear-gradient(to right, rgb(26,152,80), rgb(166,217,106), rgb(255,255,191), rgb(253,141,60), rgb(215,48,39))',
              border: '1px solid #ccc'
            }}></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '6px', color: '#555', fontWeight: '500' }}>
              <span>{Math.round(minValue).toLocaleString('de-DE')}</span>
              <span>{Math.round((minValue + maxValue) / 2).toLocaleString('de-DE')}</span>
              <span>{Math.round(maxValue).toLocaleString('de-DE')}</span>
            </div>
          </div>

          {isLoading && (
            <div style={{ 
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
              background: 'rgba(255, 255, 255, 0.85)', zIndex: 9999 
            }}>
              <svg width="60" height="60" viewBox="0 0 50 50" style={{ marginBottom: '15px' }}>
                <circle cx="25" cy="25" r="20" fill="none" stroke="#e0e0e0" strokeWidth="5" />
                <circle cx="25" cy="25" r="20" fill="none" stroke="#0b4ea2" strokeWidth="5" strokeDasharray="30 100" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#0b4ea2' }}>Lade Daten...</span>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function HeatmapMapCard({ title, geoData }) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={STYLES.mapTitle}>{title}</h2>
      
      <div style={{ padding: '16px' }}>
        <div id="map-export-container" style={{ ...STYLES.mapWrapper, background: '#fff' }}>
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
    </div>
  );
}

// ============================================================================
// MAIN PAGE VIEW
// ============================================================================

export default function MapPage() {
  const [detailLevel, setDetailLevel] = useState("Bundesländer");
  const [valueType, setValueType] = useState("Absolut");
  const [exportType, setExportType] = useState("Graphik");
  
  const [apiPayload, setApiPayload] = useState({ level: null, data: [] });
  const [isFetching, setIsFetching] = useState(false);
  const [mergedGeoData, setMergedGeoData] = useState(null);

  const [geoData, setGeoData] = useState(null);
  const [geoData3, setGeoData3] = useState(null);
  const [geoData5, setGeoData5] = useState(null);
  const [geoDataBL, setGeoDataBL] = useState(null);

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
  
  const getApiLevel = (detail) => {
    if (detail === "Bundesländer") return "Bundesland";
    if (detail === "PLZ-Bereich (2-stellig)") return "plz2";
    if (detail === "PLZ-Bereich (3-stellig)") return "plz3";
    return "plz5";
  };

  useEffect(() => {
    if (detailLevel === "kontinuierlich") return; 

    const level = getApiLevel(detailLevel);
    setIsFetching(true);
    setMergedGeoData(null); 
    setApiPayload({ level: null, data: [] }); 

    let isCancelled = false; 

    fetch(`${ENDPOINTS.STATS}?level=${level}`)
      .then(res => res.json())
      .then(data => {
        if (isCancelled) return;
        if (data.length > 0) Logger.info("API Data Fetched", data[0]); 
        setApiPayload({ level: detailLevel, data }); 
      })
      .catch(err => {
        if (isCancelled) return;
        Logger.error("Error fetching stats:", err);
        setIsFetching(false);
      });

    return () => { isCancelled = true; };
  }, [detailLevel]);

  useEffect(() => {
    if (apiPayload.level !== detailLevel || apiPayload.data.length === 0) return;

    let baseShapes;
    if (detailLevel === "PLZ-Bereiche") baseShapes = geoData5;
    else if (detailLevel === "PLZ-Bereich (3-stellig)") baseShapes = geoData3;
    else if (detailLevel === "Bundesländer") baseShapes = geoDataBL;
    else baseShapes = geoData;

    if (!baseShapes || !baseShapes.features) return;

    const timer = setTimeout(() => {
      const levelKey = getApiLevel(detailLevel); 
      
      const apiDict = apiPayload.data.reduce((acc, row) => {
        if (!row) return acc;
        acc[row[levelKey]] = { 
          total_power: Number(row.total_power) || 0, 
          total_units: Number(row.total_units) || 0,
          relative_area_power: Number(row.relative_area_power) || 0,
          relative_population_power: Number(row.relative_population_power) || 0
        };
        return acc;
      }, {});

      const mergedFeatures = baseShapes.features.map(feature => {
        const matchKey = feature.properties.plz || feature.properties.name || feature.properties.Bundesland;
        const metrics = apiDict[matchKey] || { total_power: 0, total_units: 0, relative_area_power: 0, relative_population_power: 0 };
        return {
          ...feature,
          properties: { ...feature.properties, ...metrics }
        };
      });

      setMergedGeoData({ ...baseShapes, features: mergedFeatures });
      setIsFetching(false); 
    }, 50);

    return () => clearTimeout(timer);
  }, [apiPayload, detailLevel, geoData, geoData3, geoData5, geoDataBL]);

  const handleExport = async (format) => {
    if (exportType === "Rohdaten") {
      if (!apiPayload.data || apiPayload.data.length === 0) return alert("Keine Daten zum Exportieren");
      const headers = Object.keys(apiPayload.data[0]).join(",");
      const rows = apiPayload.data.map(row => Object.values(row).join(",")).join("\n");
      const blob = new Blob([`${headers}\n${rows}`], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "mastr_daten.csv";
      link.click();
    } else {
      const mapEl = document.getElementById("map-export-container");
      if (!mapEl) return alert("Karte nicht gefunden.");
      
      const canvas = await html2canvas(mapEl, { useCORS: true });
      const imgData = canvas.toDataURL("image/png");

      if (format === "PNG") {
        const link = document.createElement("a");
        link.href = imgData;
        link.download = "map_export.png";
        link.click();
      } else if (format === "PDF") {
        const pdf = new jsPDF("landscape");
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
        pdf.save("map_export.pdf");
      }
    }
  };

  const renderDynamicMap = () => {
    const valueMap = {
      "Absolut": "total_power",
      "Relativ nach Fläche": "relative_area_power",
      "Relativ nach Einwohnerzahl": "relative_population_power"
    };
    
    const selectedValueKey = valueMap[valueType] || "total_power";
    const isLoading = isFetching || !mergedGeoData;

    switch (detailLevel) {
      case "Bundesländer":
        return <SeparateMapCard key={detailLevel} title="PV-Leistung nach Bundesländern" geoData={mergedGeoData} valueKey={selectedValueKey} isLoading={isLoading}/>;
      case "PLZ-Bereich (2-stellig)":
        return <SeparateMapCard key={detailLevel} title="Relative PV-Leistung, PLZ2 (Leitregion)" geoData={mergedGeoData} valueKey={selectedValueKey} isLoading={isLoading}/>;
      case "PLZ-Bereiche":
        return <SeparateMapCard key={detailLevel} title="PV-Leistung nach 5-stelligen PLZ-Bereichen" geoData={mergedGeoData} valueKey={selectedValueKey} isLoading={isLoading} />;
      case "kontinuierlich":
        return <HeatmapMapCard key={detailLevel} title="PV-Leistung Deutschland: Gauß-Heatmap" geoData={geoData} />;
      default:
        return <SeparateMapCard key={detailLevel} title="Relative PV-Leistung" geoData={mergedGeoData} valueKey={selectedValueKey} isLoading={isLoading} />;
    }
  };

  return (
    <div style={STYLES.page}>
      <NavBar />
      <div style={STYLES.container}>

        <div style={STYLES.mainSection}>
          
          <div style={STYLES.mapCard}>
            {renderDynamicMap()}
            
            <div style={{ 
              textAlign: 'right', 
              fontSize: '12px', 
              color: '#666', 
              padding: '0 16px 16px 16px',
              fontStyle: 'italic' 
            }}>
              Zuletzt aktualisiert: 14.05.2026
            </div>
          </div>

          <div style={STYLES.sidebar}>
             <div style={STYLES.sidebarHeader}>
               Einstellungen
             </div>
             <div style={STYLES.sidebarBody}>
               {Object.keys(SIDEBAR_OPTIONS).map(label => {
                 const currentVal = label === "Detailgrad der Regionen" ? detailLevel : (label === "Wert" ? valueType : undefined);
                 
                 return (
                   <SidebarItem 
                      key={label} 
                      label={label} 
                      options={SIDEBAR_OPTIONS[label]} 
                      currentSelection={currentVal}
                      onSelect={(opt) => {
                        if (label === "Detailgrad der Regionen") setDetailLevel(opt);
                        else if (label === "Wert") setValueType(opt);
                      }}
                   />
                 );
               })}

               {/* EXPORT SECTION */}
               <div style={{ ...STYLES.sidebarItem, marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e0e0e0' }}>
                 <label style={STYLES.sidebarLabel}>Export</label>
                 <select 
                   value={exportType}
                   onChange={(e) => setExportType(e.target.value)}
                   style={{ ...STYLES.sidebarSelect, marginBottom: '12px' }}
                 >
                   <option value="Graphik">Graphik (PNG / PDF)</option>
                   <option value="Rohdaten">Rohdaten (CSV)</option>
                 </select>

                 <div style={{ display: 'flex', gap: '8px' }}>
                   {exportType === "Graphik" ? (
                     <>
                       <button onClick={() => handleExport("PNG")} style={{ background: '#0b4ea2', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', flex: 1 }}>PNG</button>
                       <button onClick={() => handleExport("PDF")} style={{ background: '#0b4ea2', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', flex: 1 }}>PDF</button>
                     </>
                   ) : (
                     <button onClick={() => handleExport("CSV")} style={{ background: '#0b4ea2', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', width: '100%' }}>CSV Download</button>
                   )}
                 </div>
               </div>

             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
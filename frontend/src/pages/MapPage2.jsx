import React, { useEffect, useState, useMemo, useRef } from 'react'
import { MapContainer, GeoJSON, Marker, Tooltip, useMap, ImageOverlay } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.heat/dist/leaflet-heat.js';
import * as topojson from 'topojson-client';
import NavBar from '../components/NavBar'

// --- SHARED UTILITIES ---

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
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
        if (e.deltaY < 0) map.zoomIn();
        else map.zoomOut();
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [map]);
  return null;
}

function HeatmapLayer({ dataFromFastAPI }) {
  const map = useMap();

  useEffect(() => {
    if (!dataFromFastAPI || !dataFromFastAPI.heatmap_points || !L.heatLayer) return;

    const points = dataFromFastAPI.heatmap_points;
    if (points.length === 0) return;

    const maxVal = Math.max(...points.map(p => p[2]));
    const adjustedMax = maxVal * 1.5; 

    const heat = L.heatLayer(points, {
      radius: 45,         
      blur: 45,           
      maxZoom: 6,         
      minOpacity: 0.15,   
      max: adjustedMax,
      gradient: { 
        0.0: 'white',     
        0.3: 'yellow', 
        0.65: 'red', 
        1.0: 'black' 
      }
    }).addTo(map);

    return () => {
      if (map && heat) map.removeLayer(heat);
    };
  }, [dataFromFastAPI, map]);

  return null;
}

const cityIcon = new L.DivIcon({
  className: 'city-dot',
  html: `<div style="background-color: black; width: 8px; height: 8px; border-radius: 50%; border: 1px solid white;"></div>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
})

const topCities = {
  Berlin: [13.404954, 52.520008], Köln: [6.953101, 50.935173], Düsseldorf: [6.782048, 51.227144],
  'Frankfurt am Main': [8.682127, 50.110924], Hamburg: [9.993682, 53.551086], Leipzig: [12.387772, 51.343479],
  München: [11.576124, 48.137154], Dortmund: [7.468554, 51.5134], Stuttgart: [9.181332, 48.777128],
  Nürnberg: [11.077438, 49.44982], Hannover: [9.73322, 52.37052],
}

// --- UPDATED SIDEBAR WITH RADIO BUTTONS (CIRCLES) ---

const SidebarItem = ({ label, options, isSingleChoice, onSelect, currentSelection}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ marginBottom: '8px', textAlign: 'left' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 15px', border: '1px solid #e0e0e0', borderRadius: '4px',
          background: isOpen ? '#f8f9fa' : 'white', cursor: 'pointer', 
          fontSize: '14px', color: 'black', fontWeight: 500
        }}
      >
        <span>{label}</span>
        <span>▼</span>
      </div>
      {isOpen && options && (
        <div style={{ padding: '12px', border: '1px solid #e0e0e0', background: '#fff' }}>
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

// --- UNIFIED MAP CARD ---

function SeparateMapCard({ title, geoData, valueKey = "total_power" }) {
  const geoJsonRef = useRef();
  
  const values = useMemo(() => geoData.features.map(f => f.properties[valueKey] || 0), [geoData, valueKey]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const getColor = (val) => {
    if (maxValue === minValue) return 'rgb(255, 255, 0)';
    const t = (val - minValue) / (maxValue - minValue);
    if (t < 0.5) return `rgb(255, ${Math.round(255 * (1 - t * 2))}, 0)`;
    return `rgb(${Math.round(255 * (1 - (t - 0.5) * 2))}, 0, 0)`;
  };

  useEffect(() => {
    if (geoJsonRef.current) {
      geoJsonRef.current.setStyle((feature) => ({
        fillColor: getColor(feature.properties[valueKey] || 0),
        weight: 0.5,
        color: 'black',
        fillOpacity: 0.9
      }));
    }
  }, [geoData, valueKey, maxValue, minValue]);

  const onEachFeature = (feature, layer) => {
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
      <h2 style={{ margin: '0 0 18px 0', fontSize: '24px', color: '#0b4ea2', minHeight: '60px' }}>{title}</h2>
      <div style={{ height: '620px', background: '#eee', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
        <MapContainer preferCanvas={true} center={[51.1657, 10.4515]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <ResizeFix /> 
          <ScrollHandler />
          <GeoJSON 
            key="static-map-layer"
            ref={geoJsonRef} 
            data={geoData} 
            onEachFeature={onEachFeature}
          />
          {Object.entries(topCities).map(([name, [lng, lat]]) => (
            <Marker key={name} position={[lat, lng]} icon={cityIcon} interactive={false}>
              <Tooltip permanent direction="top" offset={[0, -5]} className="city-label">{name}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function HeatmapMapCard({ title, geoData }) {
  const bounds = [
    [47.270111, 5.866315],
    [55.058347, 15.041931]
  ];

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ margin: '0 0 18px 0', fontSize: '24px', color: '#0b4ea2', minHeight: '60px' }}>{title}</h2>
      <div style={{ height: '620px', background: '#fff', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
        <MapContainer preferCanvas={true} center={[51.1657, 10.4515]} zoom={6} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} attributionControl={false}>
          <ResizeFix /> 
          <ScrollHandler />
          
          <ImageOverlay
            url="http://localhost:8000/plz5_heatmap_image"
            bounds={bounds}
            opacity={0.85}
          />

          <GeoJSON 
            data={geoData} 
            style={{ fillColor: 'transparent', weight: 0.4, color: 'black', fillOpacity: 0 }}
          />

          {Object.entries(topCities).map(([name, [lng, lat]]) => (
            <Marker key={name} position={[lat, lng]} icon={cityIcon} interactive={false}>
              <Tooltip permanent direction="top" offset={[0, -5]} className="city-label">{name}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

const sidebarOptions = {
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

export default function MapPage() {
  const [geoData, setGeoData] = useState(null);
  const [geoData3, setGeoData3] = useState(null);
  const [geoData5, setGeoData5] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);

  const [detailLevel, setDetailLevel] = useState("PLZ-Bereiche");
  const [valueType, setValueType] = useState("Absolut");
  
  useEffect(() => {
      // NOTE: Ensure your backend endpoints serve compressed TopoJSON instead of raw GeoJSON
      fetch('http://localhost:8000/plz2_solar_brutto_topojson')
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(topology => {
          // Object.keys(topology.objects)[0] dynamically targets the geometry collection name
          const geojson = topojson.feature(topology, Object.keys(topology.objects)[0]);
          setGeoData(geojson);
        })
        .catch(err => console.error("❌ ERROR LOADING PLZ 2:", err));
      
      fetch('http://localhost:8000/plz3_solar_brutto_topojson')
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(topology => {
          const geojson = topojson.feature(topology, Object.keys(topology.objects)[0]);
          setGeoData3(geojson);
        })
        .catch(err => console.error("❌ ERROR LOADING PLZ 3:", err));

      fetch('http://localhost:8000/plz5_solar_brutto_topojson')
        .then(async res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then(topology => {
          const geojson = topojson.feature(topology, Object.keys(topology.objects)[0]);
          setGeoData5(geojson);
        })
        .catch(err => console.error("❌ ERROR LOADING PLZ 5:", err));
    }, []);
  
  const [apiData, setApiData] = useState([]);

  const getApiLevel = (detail) => {
    if (detail === "Bundesländer") return "bundesland";
    if (detail === "PLZ-Bereich (2-stellig)") return "plz2";
    return "plz5"; 
  };

  useEffect(() => {
    if (detailLevel === "kontinuierlich") return; 

    const level = getApiLevel(detailLevel);
    
    fetch(`http://localhost:8000/solar/dashboard-stats?level=${level}`)
      .then(res => res.json())
      .then(data => {
        console.log("API DATA ROW 1:", data[0]); 
        setApiData(data);
      })
      .catch(err => console.error("Error fetching stats:", err));
  }, [detailLevel]);

  const mergedGeoData = useMemo(() => {
    let baseShapes = geoData; 
    if (detailLevel === "PLZ-Bereiche") baseShapes = geoData5;
    
    if (!baseShapes || !apiData.length) return baseShapes;

    const apiDict = {};
    const levelKey = getApiLevel(detailLevel); 
    apiData.forEach(row => {
      apiDict[row[levelKey]] = {
        total_power: row.total_power,
        total_units: row.total_units
      };
    });

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
  }, [geoData, geoData5, apiData, detailLevel]);

  if (!geoData || !geoData5) return <div style={{ textAlign: 'center', marginTop: '50px' }}><h2>Loading...</h2></div>;

  const renderDynamicMap = () => {
    let selectedValueKey = "total_power"; 
    
    if (valueType === "Absolut") {
      selectedValueKey = "total_power"; 
    } else if (valueType === "Relativ nach Fläche") {
      selectedValueKey = "dichte_leistung_area"; 
    } else if (valueType === "Relativ nach Einwohnerzahl") {
      selectedValueKey = "dichte_leistung_population"; 
    }

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
    <div style={{ minHeight: '100vh', width: '100%', background: '#fcfcfc' }}>
      <NavBar />
      <div style={{ width: '90%', maxWidth: '1450px', margin: '0 auto', padding: '36px 0' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '48px', marginBottom: '60px' }}>
          <div style={{ background: '#fff', padding: '22px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
            <SeparateMapCard title="Anteil der COVID-19 Patient*innen..." geoData={geoData} />
          </div>
          <div style={{ background: '#fff', padding: '22px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}>
            <SeparateMapCard title="Anteil der belegten Betten..." geoData={geoData} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', background: '#fff', padding: '24px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.12)', alignItems: 'flex-start' }}>
          
          <div style={{ flex: 3 }}>
            {renderDynamicMap()}
          </div>

          <div style={{ flex: 1, minWidth: '300px', borderLeft: '1px solid #eee', paddingLeft: '20px' }}>
             <div style={{ textAlign: 'right', marginBottom: '10px' }}>
               <span style={{ color: 'black', fontSize: '24px', cursor: 'pointer' }}>ⓧ</span>
             </div>
             
             {Object.keys(sidebarOptions).map(label => {
               const isSingle = ["Detailgrad der Regionen", "Wert"].includes(label);
               
               let currentVal = undefined;
               if (label === "Detailgrad der Regionen") currentVal = detailLevel;
               if (label === "Wert") currentVal = valueType;
             return (
                 <SidebarItem 
                    key={label} 
                    label={label} 
                    options={sidebarOptions[label]} 
                    isSingleChoice={isSingle} 
                    currentSelection={currentVal}
                    onSelect={(opt) => {
                      if (label === "Detailgrad der Regionen") {
                        setDetailLevel(opt);
                      } else if (label === "Wert") {
                        setValueType(opt);
                      }
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
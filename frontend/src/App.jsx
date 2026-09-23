import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; // Restored to fix MapPage3 inheritance

// Pages & Components
import MapPage from './pages/MapPage';
import MapPage2 from './pages/MapPage2';
import MapPage3 from './pages/MapPage3';
import Footer from './components/Footer';
import NavBar from './components/NavBar';

// ============================================================================
// STYLES
// ============================================================================
const STYLES = {
  page: { minHeight: '100vh', width: '100%', background: '#fcfcfc', color: '#333', fontFamily: 'sans-serif' },
  container: { width: '90%', maxWidth: '1200px', margin: '0 auto', padding: '60px 0' },
  
  hero: { textAlign: 'center', marginBottom: '80px' },
  heroTitle: { fontSize: '42px', fontWeight: '800', color: '#0b4ea2', marginBottom: '16px' },
  heroSubtitle: { fontSize: '18px', color: '#666', maxWidth: '700px', margin: '0 auto 32px auto', lineHeight: '1.6' },
  buttonGroup: { display: 'flex', gap: '16px', justifyContent: 'center' },
  btnPrimary: { background: '#0b4ea2', color: '#fff', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', fontWeight: '600', fontSize: '15px', border: 'none', cursor: 'pointer' },
  btnSecondary: { background: '#fff', color: '#333', padding: '12px 24px', borderRadius: '6px', textDecoration: 'none', fontWeight: '600', fontSize: '15px', border: '1px solid #e0e0e0', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '80px' },
  card: { background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px', textAlign: 'left' },
  cardIcon: { fontSize: '32px', marginBottom: '16px' },
  cardTitle: { fontSize: '20px', fontWeight: '600', marginBottom: '12px' },
  cardText: { fontSize: '14px', color: '#666', lineHeight: '1.6' },

  section: { background: '#fff', borderRadius: '8px', border: '1px solid #e0e0e0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '48px', marginBottom: '60px' },
  sectionTitle: { fontSize: '28px', fontWeight: '700', marginBottom: '24px', color: '#333' },
  paragraph: { fontSize: '16px', color: '#555', lineHeight: '1.8', marginBottom: '16px' }
};

// ============================================================================
// HOME COMPONENT
// ============================================================================
function Home() {
  return (
    <div style={STYLES.page}>
      <NavBar />
      
      <div style={STYLES.container}>
        <div style={STYLES.hero}>
          <h1 style={STYLES.heroTitle}>Die Energiewende im Blick</h1>
          <p style={STYLES.heroSubtitle}>
            Interaktive Analysen und Visualisierungen zum Ausbau erneuerbarer Energien in Deutschland. 
            Basierend auf hochauflösenden Daten des Marktstammdatenregisters (MaStR).
          </p>
          <div style={STYLES.buttonGroup}>
            <Link to="/map3" style={STYLES.btnPrimary}>Zum Haupt-Dashboard</Link>
            <Link to="/map" style={STYLES.btnSecondary}>Klassische Karte</Link>
          </div>
        </div>

        <div style={STYLES.grid}>
          <div style={STYLES.card}>
            <div style={STYLES.cardIcon}>🗺️</div>
            <h3 style={STYLES.cardTitle}>Regionale Auflösung</h3>
            <p style={STYLES.cardText}>
              Nutzer können zwischen Bundesländern, 2-stelligen und 5-stelligen PLZ-Bereichen wechseln, um lokale Hotspots zu finden.
            </p>
          </div>
          <div style={STYLES.card}>
            <div style={STYLES.cardIcon}>⚡</div>
            <h3 style={STYLES.cardTitle}>Relative Leistung</h3>
            <p style={STYLES.cardText}>
              Vergleiche absolute Zahlen oder berechne die Leistung relativ nach Fläche (kWp/km²) oder Einwohnerzahl.
            </p>
          </div>
          <div style={STYLES.card}>
            <div style={STYLES.cardIcon}>📊</div>
            <h3 style={STYLES.cardTitle}>Tagesaktuelle Daten</h3>
            <p style={STYLES.cardText}>
              Stetig aktualisierte Daten aus dem MaStR mit detaillierten Filtern für Solar, Wind und mehr.
            </p>
          </div>
        </div>

        <div style={STYLES.section}>
          <h2 style={STYLES.sectionTitle}>Motivation & Methodik</h2>
          <p style={STYLES.paragraph}>
            Dieses Projekt visualisiert die komplexe Datenstruktur des Marktstammdatenregisters, um den Ausbau erneuerbarer Energien transparent und regional greifbar zu machen.
          </p>
          <p style={STYLES.paragraph}>
            Die Rohdaten umfassen Millionen von Einträgen, die über eine FastAPI-Schnittstelle aggregiert und in einer PostgreSQL-Datenbank verarbeitet werden, um diese performanten Kartenansichten zu ermöglichen.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// APP ROUTER
// ============================================================================
function App() {
  return (
    <Router>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/map2" element={<MapPage2 />} />
            <Route path="/map3" element={<MapPage3 />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
import { useState } from 'react'
// 1. CRITICAL: You must import these from the library you installed
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'

import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

// 2. CRITICAL: You must import your MapPage component
import MapPage from './pages/MapPage' 
import MapPage2 from './pages/MapPage2' 

function Home() {
  const [count, setCount] = useState(0)

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React</h1>
      
      {/* 3. ADDED: A button to actually get to the map */}
      <div className="card">
        <Link to="/map">
          <button style={{ backgroundColor: '#646cff', color: 'white' }}>
            Go to Map Dashboard
          </button>
        </Link>
      
      </div>      {/* 4. ADDED: A button to actually get to the map */}
      <div className="card">
        <Link to="/map2">
          <button style={{ backgroundColor: '#646cff', color: 'white' }}>
            Go to other Map Dashboard
          </button>
        </Link>
      </div>

      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
        <p>
          Edit <code>src/App.jsx</code> and save to test HMR
        </p>
      </div>
    </>
  )
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        
        {/* 4. FIX: Use path="/map" instead of "/pages" for a cleaner URL */}
        <Route path="/map" element={<MapPage />} />
        <Route path="/map2" element={<MapPage2 />} />
      </Routes>
    </Router>
  )
}

export default App

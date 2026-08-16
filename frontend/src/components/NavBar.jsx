import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import './NavBar.css';

function NavBar() {
  const items = [
    { label: 'Home', to: '/' },
    { label: 'Overview', to: '/map' },
    { label: 'Battery Charts', to: '/map' },
    { label: 'Revenue Index', to: '/map' },
    { label: 'Mobility Charts', to: '/map' },
  ];

  return (
    <header className="navbar">
      <div className="navbar__inner">
        <Link to="/" className="navbar__brand" aria-label="Go to home page">
          <div className="navbar__logoBox">CARI</div>
          <div className="navbar__brandText">
            <div className="navbar__brandTitle">Marktstammdatenregister</div>
            <div className="navbar__brandSubtitle">Dashboard</div>
          </div>
        </Link>

        <nav className="navbar__nav" aria-label="Primary navigation">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `navbar__link${isActive ? ' navbar__link--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="navbar__dropdown">
            <button type="button" className="navbar__dropdownToggle">
              <span>More</span>
              <span className="navbar__dropdownChevron">⌄</span>
            </button>

            <div className="navbar__dropdownMenu">
              <NavLink to="/maps2" className="navbar__dropdownItem">
                Power
              </NavLink>
              <NavLink to="/market/gas" className="navbar__dropdownItem">
                Gas
              </NavLink>
              <NavLink to="/market/co2" className="navbar__dropdownItem">
                CO₂
              </NavLink>
            </div>
          </div>
        </nav>

        <div className="navbar__actions">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* Short vertical dash */}
            <div style={{ width: '1px', height: '32px', backgroundColor: '#d0d0d0', marginRight: '16px' }}></div>

            {/* Language Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
              
              <div style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                {/* Active: German Flag */}
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  border: '1px solid #d0d0d0', padding: '1px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
                    <svg viewBox="0 0 3 3" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <rect width="3" height="1" y="0" fill="#000000" />
                      <rect width="3" height="1" y="1" fill="#DD0000" />
                      <rect width="3" height="1" y="2" fill="#FFCE00" />
                    </svg>
                  </div>
                </div>

                {/* Inactive: English (UK) Flag */}
                <div style={{
                  width: '18px', height: '18px', borderRadius: '50%',
                  border: '1px solid #d0d0d0', padding: '1px',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  opacity: 0.4 // Dimmed to show it is inactive
                }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
                    <svg viewBox="0 0 60 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                      <rect width="60" height="60" fill="#012169" />
                      <path d="M0,0 L60,60 M60,0 L0,60" stroke="#fff" strokeWidth="14" />
                      <path d="M0,0 L60,60 M60,0 L0,60" stroke="#C8102E" strokeWidth="6" />
                      <path d="M30,0 L30,60 M0,30 L60,30" stroke="#fff" strokeWidth="16" />
                      <path d="M30,0 L30,60 M0,30 L60,30" stroke="#C8102E" strokeWidth="10" />
                    </svg>
                  </div>
                </div>
              </div>
              
              <span style={{ fontSize: '11px', color: '#1a73e8', fontFamily: 'sans-serif' }}>Sprache</span>
            </div>
          </div>
        </div>

      </div>
    </header>
  );
}

export default NavBar;
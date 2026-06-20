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

        <div className="navbar__actions" />
      </div>
    </header>
  );
}

export default NavBar;
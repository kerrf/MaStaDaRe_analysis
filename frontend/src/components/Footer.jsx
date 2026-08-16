import React from 'react';
import { Link } from 'react-router-dom';

const STYLES = {
  footer: {
    width: '100%',
    backgroundColor: '#fff',
    borderTop: '1px solid #e0e0e0',
    padding: '24px 0',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '32px', // Space between links
    fontSize: '14px',
    color: '#555',
    // marginTop: 'auto' ensures it gets pushed to the bottom if the page content is short
    marginTop: 'auto' 
  },
  link: {
    color: '#555',
    textDecoration: 'none',
    fontWeight: '500',
    transition: 'color 0.2s ease'
  }
};

export default function Footer() {
  return (
    <footer style={STYLES.footer}>
      <Link to="/datenschutz" style={STYLES.link} onMouseOver={(e) => e.target.style.color = '#0b4ea2'} onMouseOut={(e) => e.target.style.color = '#555'}>
        Datenschutz
      </Link>
      
      <span style={{ color: '#d0d0d0' }}>|</span>
      
      <a href="https://github.com/YOUR_GITHUB_HANDLE" target="_blank" rel="noopener noreferrer" style={STYLES.link} onMouseOver={(e) => e.target.style.color = '#0b4ea2'} onMouseOut={(e) => e.target.style.color = '#555'}>
        GitHub
      </a>
      
      <span style={{ color: '#d0d0d0' }}>|</span>
      
      <a href="https://linkedin.com/in/YOUR_LINKEDIN_HANDLE" target="_blank" rel="noopener noreferrer" style={STYLES.link} onMouseOver={(e) => e.target.style.color = '#0b4ea2'} onMouseOut={(e) => e.target.style.color = '#555'}>
        LinkedIn
      </a>
    </footer>
  );
}
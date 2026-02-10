'use client';

import { useState, useEffect } from 'react';
import { Providers } from './components/Providers';
import LMSRAdmin from './components/LMSRAdmin';
import AgentLanding from './components/AgentLanding';

type Route = 'admin' | 'agents';

function Router() {
  const [route, setRoute] = useState<Route>('admin');

  // Handle hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (hash === 'agents') {
        setRoute('agents');
      } else {
        setRoute('admin');
      }
    };

    // Set initial route
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Simple navigation
  const nav = (
    <nav style={navStyles.container}>
      <a
        href="#"
        style={{
          ...navStyles.link,
          ...(route === 'admin' ? navStyles.active : {}),
        }}
      >
        Markets
      </a>
      <a
        href="#agents"
        style={{
          ...navStyles.link,
          ...(route === 'agents' ? navStyles.active : {}),
        }}
      >
        For Agents
      </a>
    </nav>
  );

  return (
    <>
      {nav}
      {route === 'agents' ? <AgentLanding /> : <LMSRAdmin />}
    </>
  );
}

const navStyles = {
  container: {
    display: 'flex',
    gap: '0',
    borderBottom: '2px solid #00ff00',
    backgroundColor: '#0a0a0a',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  link: {
    padding: '15px 30px',
    textDecoration: 'none',
    color: '#888',
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 'bold' as const,
    fontSize: '14px',
    borderRight: '1px solid #333',
    transition: 'all 0.2s',
  },
  active: {
    backgroundColor: '#1a1a1a',
    color: '#00ff00',
  },
};

export default function App() {
  return (
    <Providers>
      <Router />
    </Providers>
  );
}

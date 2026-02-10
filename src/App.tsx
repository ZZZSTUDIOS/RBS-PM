'use client';

import { useState, useEffect } from 'react';
import { Providers } from './components/Providers';
import LMSRAdmin from './components/LMSRAdmin';
import AgentLanding from './components/AgentLanding';
import ListMarket from './components/ListMarket';

type Route = 'admin' | 'agents' | 'list';

function Router() {
  const [route, setRoute] = useState<Route>('admin');

  // Handle hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      if (hash === 'agents') {
        setRoute('agents');
      } else if (hash === 'list') {
        setRoute('list');
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
        href="#list"
        style={{
          ...navStyles.link,
          ...(route === 'list' ? navStyles.active : {}),
        }}
      >
        List Market
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

  const renderRoute = () => {
    switch (route) {
      case 'agents':
        return <AgentLanding />;
      case 'list':
        return (
          <div style={{ maxWidth: '600px', margin: '40px auto', padding: '0 20px' }}>
            <ListMarket />
          </div>
        );
      default:
        return <LMSRAdmin />;
    }
  };

  return (
    <>
      {nav}
      {renderRoute()}
    </>
  );
}

const navStyles = {
  container: {
    display: 'flex',
    gap: '0',
    borderBottom: '4px solid #000',
    backgroundColor: '#fff',
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
  },
  link: {
    padding: '15px 30px',
    textDecoration: 'none',
    color: '#000',
    fontFamily: 'monospace',
    fontWeight: 'bold' as const,
    fontSize: '14px',
    borderRight: '2px solid #000',
  },
  active: {
    backgroundColor: '#000',
    color: '#fff',
  },
};

export default function App() {
  return (
    <Providers>
      <Router />
    </Providers>
  );
}

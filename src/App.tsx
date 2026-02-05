'use client';

import React from 'react';
import { Providers } from './components/Providers';
import DopplerAdmin from './components/DopplerAdmin';

export default function App() {
  return (
    <Providers>
      <DopplerAdmin />
    </Providers>
  );
}

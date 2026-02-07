import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Scaffold-only router. Does NOT replace legacy nav yet.

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path=''/'' element={<Navigate to=''/app'' replace />} />
        <Route path=''/app/*'' element={<div id=''legacy-app-mount'' />} />
      </Routes>
    </BrowserRouter>
  );
}

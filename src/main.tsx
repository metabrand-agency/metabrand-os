import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Projects from './pages/Projects';
import Workspace from './pages/Workspace';
import DemoLogin from './pages/DemoLogin';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/demo/:slug" element={<DemoLogin />} />
        <Route path="/" element={<Projects />} />
        <Route path="/:slug/*" element={<Workspace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);

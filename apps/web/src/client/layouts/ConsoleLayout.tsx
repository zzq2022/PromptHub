import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ConsoleHeader } from '../components/ConsoleHeader';

export function ConsoleLayout() {
  const location = useLocation();
  const isFullWidth = location.pathname.startsWith('/console/skills') || location.pathname.startsWith('/console/admin');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <ConsoleHeader />
      <div className={`flex-1 flex flex-col min-h-0 ${isFullWidth ? 'w-full' : 'max-w-7xl mx-auto px-4 py-8 w-full'}`}>
        <Outlet />
      </div>
    </div>
  );
}
export default ConsoleLayout;

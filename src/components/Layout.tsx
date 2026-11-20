import { NavLink, Outlet, Link } from 'react-router-dom';
import { Compass, Map, PlusCircle, Info } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Map', icon: Map, end: true },
  { to: '/about', label: 'About', icon: Info, end: false },
];

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-offwhite">
      <header className="sticky top-0 z-[1200] h-16 border-b border-stone-200/70 bg-offwhite/90 backdrop-blur">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-700 text-white">
              <Compass className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-stone-900">Wandermap</span>
          </Link>

          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition sm:px-4 ${
                    isActive
                      ? 'bg-forest-100 text-forest-900'
                      : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
            <NavLink
              to="/submit"
              className={({ isActive }) =>
                `ml-1 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition sm:px-4 ${
                  isActive
                    ? 'bg-forest-800 text-white'
                    : 'bg-forest-700 text-white hover:bg-forest-800'
                }`
              }
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Submit a place</span>
              <span className="sm:hidden">Add</span>
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

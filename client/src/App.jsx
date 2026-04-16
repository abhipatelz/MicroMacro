import { Routes, Route, Navigate, Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Projects from './pages/Projects.jsx';
import ProjectDetail from './pages/ProjectDetail.jsx';
import NewProject from './pages/NewProject.jsx';
import Teams from './pages/Teams.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
import TaskDetail from './pages/TaskDetail.jsx';
import Yearly from './pages/Yearly.jsx';
import OrgOverview from './pages/OrgOverview.jsx';
import { Avatar } from './ui.jsx';

function Layout({ children }) {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const nav = [
    { to: '/', label: 'My Dashboard', icon: '■' },
    { to: '/projects', label: 'Projects', icon: '▤' },
    { to: '/teams', label: 'Teams', icon: '◎' },
    { to: '/yearly', label: 'Yearly View', icon: '◷' }
  ];
  if (user && (user.role === 'manager' || user.role === 'admin')) {
    nav.push({ to: '/org', label: 'Org Overview', icon: '◬' });
  }
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-60 shrink-0 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center font-bold">M</div>
            <div>
              <div className="font-semibold leading-tight">MicroMacro</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wider">Pharma QA PM</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <span className="text-brand-300">{n.icon}</span>
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 flex items-center gap-2">
          <Avatar name={user?.name} />
          <div className="flex-1 text-xs">
            <div className="font-medium text-slate-100">{user?.name}</div>
            <div className="text-slate-400">{user?.title || user?.role}</div>
          </div>
          <button onClick={logout} className="text-xs text-slate-400 hover:text-white" title="Sign out">
            ⎋
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div key={loc.pathname} className="max-w-7xl mx-auto px-6 py-6">{children}</div>
      </main>
    </div>
  );
}

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/projects/new" element={<Protected><NewProject /></Protected>} />
      <Route path="/projects/:id" element={<Protected><ProjectDetail /></Protected>} />
      <Route path="/tasks/:id" element={<Protected><TaskDetail /></Protected>} />
      <Route path="/teams" element={<Protected><Teams /></Protected>} />
      <Route path="/teams/:id" element={<Protected><TeamDetail /></Protected>} />
      <Route path="/yearly" element={<Protected><Yearly /></Protected>} />
      <Route path="/yearly/:userId" element={<Protected><Yearly /></Protected>} />
      <Route path="/org" element={<Protected><OrgOverview /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

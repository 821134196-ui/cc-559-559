import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from './api';
import Board from './pages/Board';
import EventDetail from './pages/EventDetail';
import Login from './pages/Login';
import NewEvent from './pages/NewEvent';
import type { User } from './types';

export const ROLE_NAMES: Record<string, string> = {
  DISPATCHER: '值班员',
  MEDIC: '急救员',
  ADMIN: '管理人员',
};

export default function App() {
  const [user, setUser] = useState<User | null>(getUser());
  const navigate = useNavigate();

  if (!user) {
    return (
      <Login
        onLogin={(u) => {
          setUser(u);
          navigate('/');
        }}
      />
    );
  }

  return (
    <div>
      <header className="topbar">
        <Link to="/" className="brand">
          🏥 体育中心运动损伤应急处置系统
        </Link>
        <nav>
          <Link to="/">值班屏</Link>
          {(user.role === 'DISPATCHER' || user.role === 'ADMIN') && (
            <Link to="/events/new">新报警</Link>
          )}
        </nav>
        <div className="me">
          <span>
            {user.name}（{ROLE_NAMES[user.role]}）
          </span>
          <button
            className="link"
            onClick={() => {
              clearSession();
              location.reload();
            }}
          >
            退出
          </button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Board me={user} />} />
          <Route path="/events/new" element={<NewEvent me={user} />} />
          <Route path="/events/:id" element={<EventDetail me={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

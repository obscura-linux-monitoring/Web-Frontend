import './App.css';
import { Route, Routes } from 'react-router-dom';
import UserDashboard from './components/user/UserDashboard';
import SideBar from './components/SideBar';
import { useAuth } from './hooks/useAuth';
import SettingsView from './components/node/SettingView';
import Header from './components/Header';
import NodeMetrics from './components/node/NodeMetrics';
import { NodeProvider } from './context/NodeContext';
import ProcessView from './components/node/ProcessView';
import PerformanceView from './components/performance/PerformanceView';
import NodeTerminal from './components/node/NodeTerminal';
import NodeServices from './components/node/NodeServices';
import Docker from './components/node/Docker';
import LandingPage from './components/main/LandingPage';
import { SshProvider } from './context/SshContext';
import TeamManagement from './components/team/TeamManagement';
import Profile from './components/user/Profile';
import { useState, useEffect } from 'react';

const App = () => {
  const {
    isAuthenticated,
    isAdmin,
    handleLogout,
  } = useAuth();

  // 1. 사이드바 오픈 상태
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // 2. 모바일 여부 상태
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) setIsSidebarOpen(false); // PC 전환 시 사이드바 닫기
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 로그인하지 않은 경우 소개 페이지 표시
  if (!isAuthenticated) {
    return <LandingPage onLogin={() => window.location.reload()} />;
  }

  // 로그인된 경우 사이드바와 라우트 표시
  return (
    <SshProvider>
      <NodeProvider>
        <div className="app-container">
          <Header
            onLogout={handleLogout}
            isAdmin={isAdmin}
            isMobile={isMobile}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
          />
          <SideBar
            isMobile={isMobile}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
          />
          <div className="main-content">
            <Routes>
              <Route path="/" element={<UserDashboard />} />
              <Route path="/nodes/monitoring/:nodeId" element={<NodeMetrics />} />
              <Route path="/nodes/process/:nodeId" element={<ProcessView />} />
              <Route path="/nodes/docker/:nodeId" element={<Docker />} />
              <Route path="/nodes/performance/:nodeId" element={<PerformanceView />} />
              <Route path="/nodes/services/:nodeId" element={<NodeServices />} />
              <Route path="/nodes/terminal/:nodeId" element={<NodeTerminal />} />
              <Route path="/team/management/" element={<TeamManagement />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/profile" element={<Profile />} />
            </Routes>
          </div>
        </div>
      </NodeProvider>
    </SshProvider>
  );
};

export default App;
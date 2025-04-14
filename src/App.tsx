import './App.css';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Route, Routes } from 'react-router-dom';
import GoogleLoginButton from './components/user/GoogleLoginButton';
import UserDashboard from './components/user/UserDashboard';
import SideBar from './components/SideBar';
import { useAuth } from './hooks/useAuth';
import NodesView from './components/node/NodesView';
import DetailsView from './components/node/DetailsView';
import SettingsView from './components/node/SettingView';
import Header from './components/Header';

const App = () => {
  const {
    isAuthenticated,
    isAdmin,
    handleLogout,
  } = useAuth();

  // 로그인하지 않은 경우 로그인 버튼 표시
  if (!isAuthenticated) {
    return (
      <GoogleOAuthProvider clientId="465689070189-hr1tl3qm0uamosf0nnf5o06rqo2g35fv.apps.googleusercontent.com">
        <GoogleLoginButton onLogin={() => window.location.reload()} />
      </GoogleOAuthProvider>
    );
  }

  // 로그인된 경우 사이드바와 라우트 표시
  return (
    <GoogleOAuthProvider clientId="465689070189-hr1tl3qm0uamosf0nnf5o06rqo2g35fv.apps.googleusercontent.com">
      <div className="app-container">
        <Header onLogout={handleLogout} isAdmin={isAdmin} />
        <SideBar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<UserDashboard/>} />
            <Route path="/nodes" element={<NodesView />} />
            <Route path="/details" element={<DetailsView />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </div>
      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
import { useState } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { createAuthenticatedWebSocket } from '../utils/websocket';

export const useAuth = () => {
  const auth = useAuthContext();
  
  // UI 관련 상태 추가 (기존 useAuth.tsx에서 있던 기능)
  const [showProfile, setShowProfile] = useState(false);
  
  return {
    ...auth,
    showProfile,
    setShowProfile,

    createAuthenticatedWebSocket,
    
    hasNodeAccess: (nodeId: string): boolean => {
      if (auth.isAdmin) return true;
      return true;
    }
  };
};
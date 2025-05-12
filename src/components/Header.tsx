import styles from '../scss/Header.module.scss';
import { getUserInfo, getUserProfileImage } from './utils/Auth';
import { useState, useRef, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import Profile from './user/Profile';
import { useNodeContext } from '../context/NodeContext';
import MiniMetricsGraph from './node/MiniMetricsGraph';

interface HeaderProps {
  onLogout: () => void | Promise<void>;
  isAdmin?: boolean;
}

const Header = ({ onLogout, isAdmin = false }: HeaderProps) => {
  const profileImageUrl = getUserProfileImage();
  const userInfo = getUserInfo();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { selectedNode, monitoringEnabled, toggleMonitoring } = useNodeContext();
  const { nodeId } = useParams<{ nodeId: string }>();
  const location = useLocation(); // 현재 경로 가져오기
  
  // 외부 클릭 감지로 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // 현재 URL의 nodeId 또는 context의 selectedNode 사용
  const currentNodeId = nodeId || selectedNode?.node_id;
  
  // 현재 활성화된 메뉴 경로 확인
  const isMonitoringActive = location.pathname.includes('/nodes/monitoring/');
  const isProcessActive = location.pathname.includes('/nodes/process/');
  const isTerminalActive = location.pathname.includes('/nodes/terminal/');
  const isCpuActivate = location.pathname.includes('/nodes/performance/');
  
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          {currentNodeId ? (
            <div className={styles.nodeLinks}>
              {/* 모니터링 토글 버튼 */}
              <button 
                className={`${styles.monitoringToggle} ${monitoringEnabled ? styles.enabled : styles.disabled}`}
                onClick={toggleMonitoring}
                title={monitoringEnabled ? '모니터링 중지' : '모니터링 시작'}
                >
                <span className={styles.toggleIcon}></span>
                <span className={styles.toggleText}>
                  {monitoringEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
              
              {monitoringEnabled && <MiniMetricsGraph />}

              <Link 
                to={`/nodes/monitoring/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isMonitoringActive ? styles.activeLink : ''}`}
              >
                모니터링
                {isMonitoringActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/process/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isProcessActive ? styles.activeLink : ''}`}
              >
                프로세스
                {isProcessActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/container/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                Docker
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/performance/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                작업관리자
                {isCpuActivate && <span className={styles.activeIndicator}></span>}
              </Link>
              {/* <Link 
                to={`/nodes/disk/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                디스크
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/memory/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                메모리
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/network/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                네트워크
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link> */}
              <Link 
                to={`/nodes/service/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                서비스
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
              <Link 
                to={`/nodes/terminal/${currentNodeId}`} 
                className={`${styles.nodeLink} ${isTerminalActive ? styles.activeLink : ''}`}
              >
                터미널
                {isTerminalActive && <span className={styles.activeIndicator}></span>}
              </Link>
            </div>
          ) : (
            <span className={styles.noNodeSelected}>노드를 선택해주세요</span>
          )}
        </div>
        <div className={styles.headerRight}>
          <div className={styles.profileContainer} ref={dropdownRef}>
            <div 
              className={styles.profileImage} 
              title={`${userInfo?.name || userInfo?.email || '사용자'} 프로필`}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="Profile" />
              ) : (
                <div className={styles.placeholderImage}>
                  {userInfo?.email?.[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            
            {showDropdown && (
              <div className={styles.dropdown}>
                <div className={styles.userInfo}>
                  <p className={styles.userName}>{userInfo?.name || '사용자'}</p>
                  <p className={styles.userEmail}>{userInfo?.email}</p>
                </div>
                <div className={styles.dropdownButtons}>
                  <button 
                    className={styles.dropdownButton}
                    onClick={() => {
                      setShowProfile(true);
                      setShowDropdown(false);
                    }}
                  >
                    👤 프로필 보기
                  </button>
                  
                  {isAdmin && (
                    <Link to="/admin" className={styles.dropdownButton}>
                      🔒 관리자 페이지
                    </Link>
                  )}
                  
                  <button 
                    className={`${styles.dropdownButton} ${styles.logoutButton}`}
                    onClick={onLogout}
                  >
                    🚪 로그아웃
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showProfile && (
        <div className={styles.profileModal}>
          <div className={styles.profileModalContent}>
            <button 
              className={styles.closeButton}
              onClick={() => setShowProfile(false)}
            >
              ✖
            </button>
            <Profile />
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
import styles from '../scss/Header.module.scss';
import { getUserInfo, getUserProfileImage } from './utils/Auth';
import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerLeft}>
          {currentNodeId ? (
            <div className={styles.nodeLinks}>
              <Link to={`/nodes/monitoring/${currentNodeId}`} className={styles.nodeLink}>
                모니터링
              </Link>
              <Link to={`/nodes/process/${currentNodeId}`} className={styles.nodeLink}>
                프로세스
              </Link>
              <Link to={`/nodes/command/${currentNodeId}`} className={styles.nodeLink}>
                명령어
              </Link>
              
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
              
              {/* 미니 메트릭 그래프 추가 */}
              {monitoringEnabled && <MiniMetricsGraph />}
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
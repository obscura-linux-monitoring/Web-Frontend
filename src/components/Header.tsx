import styles from '../scss/Header.module.scss';
import { getUserInfo, getUserProfileImage } from './utils/Auth';
import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Profile from './user/Profile';

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
  
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
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
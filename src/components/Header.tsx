import styles from '../scss/Header.module.scss';
import { useEffect } from 'react';
import { getUserInfo, getUserProfileImage } from './utils/Auth';

const Header = () => {
  const profileImageUrl = getUserProfileImage();
  
  useEffect(() => {
    const directUserInfo = localStorage.getItem("userInfo");
    console.log("🔍 localStorage에서 직접 조회한 userInfo:", directUserInfo);
    
    // JWT 토큰 확인
    const token = localStorage.getItem("jwt");
    console.log("🔍 JWT 토큰 존재:", !!token);
  }, []);
  
  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div className={styles.headerRight}>
          {profileImageUrl ? (
            <div className={styles.profileImage}>
              <img src={profileImageUrl} alt="Profile" />
              <p style={{ display: 'none' }}>{/* 로그용 숨겨진 텍스트 */}
                이미지 URL: {profileImageUrl}
              </p>
            </div>
          ) : (
            <div className={styles.profileImage}>
              {/* 프로필 이미지가 없을 때 대체 이미지 표시 */}
              <div className={styles.placeholderImage}>
                {getUserInfo()?.email?.[0]?.toUpperCase() || '?'}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
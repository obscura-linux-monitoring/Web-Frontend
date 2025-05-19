import { useEffect, useState } from 'react';
import api from '../../api';
import { getToken } from '../../utils/Auth';
import styles from '../../scss/user/Profile.module.scss';

type Profile = {
  sub: string;
  email: string;
  exp: number;
  obscura_key: string;
};

const Profile = () => {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [obscuraKey, setObscuraKey] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/user/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        setUser(res.data.user);
        setObscuraKey(res.data.obscura_key);
        setVersion(res.data.version);
      })
      .catch((err) => {
        console.error('❌ 데이터 로딩 실패:', err);
        setLoading(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <p>⏳ 로딩 중...</p>;
  if (!user) return <p>😥 사용자 정보를 불러오지 못했습니다.</p>;

  return (
    <div className={styles.container}>
      <div className={styles.profileSection}>
        <h2>🙋‍♂️ 사용자 프로필</h2>
        <p><strong>ID:</strong> {user.sub}</p>
        <p><strong>이메일:</strong> {user.email}</p>
        <p><strong>JWT토큰 만료 시각:</strong> {new Date(user.exp * 1000).toLocaleString()}</p>
        {obscuraKey && (
          <p><strong>🔑 Obscura Key:</strong> {obscuraKey}</p>
        )}
        <h3># system-monitor</h3>
        <p className={styles.installCommand}>
          wget -O install.sh https://github.com/obscura-linux-monitoring/System-Monitor/releases/download/{version}
          /install.sh && chmod +x install.sh && sudo ./install.sh {version} {obscuraKey}
        </p>
      </div>
    </div>
  );
};

export default Profile;
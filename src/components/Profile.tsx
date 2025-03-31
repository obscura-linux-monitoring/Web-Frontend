import { useEffect, useState } from 'react';
import api from '../api';
import { getToken } from '../components/utils/Auth';

type UserProfile = {
  sub: string;
  email: string;
  exp: number;
};

const UserProfile = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/protected/profile', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((res) => {
        setUser(res.data.user);
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ 인증 실패:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>⏳ 로딩 중...</p>;
  if (!user) return <p>😥 사용자 정보를 불러오지 못했습니다.</p>;

  return (
    <div>
      <h2>🙋‍♂️ 사용자 프로필</h2>
      <p><strong>ID:</strong> {user.sub}</p>
      <p><strong>이메일:</strong> {user.email}</p>
      <p><strong>만료 시각:</strong> {new Date(user.exp * 1000).toLocaleString()}</p>
    </div>
  );
};

export default UserProfile;

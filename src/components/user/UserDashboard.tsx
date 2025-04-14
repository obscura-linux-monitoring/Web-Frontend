import Profile from './Profile';
import { getUserFromToken} from '../utils/Auth';

interface Props {
  onLogout: () => void;
  onShowProfile: (v: boolean) => void;
  showProfile: boolean;
  isAdmin: boolean;
}

const UserDashboard = ({ onLogout, onShowProfile, showProfile, isAdmin }: Props) => {
  const user = getUserFromToken();

  return (
    <div>
      <p>✅ 로그인됨!</p>
      <p>🙋‍♂️ 사용자: {user?.email}</p>
      <button onClick={onLogout}>로그아웃</button>
      {isAdmin && <button>관리자 페이지</button>}
      <button onClick={() => onShowProfile(true)}>프로필 보기</button>
      {showProfile && <Profile />}
    </div>
  );
};

export default UserDashboard;

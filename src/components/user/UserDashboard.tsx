import { getUserFromToken } from '../../utils/Auth';

const UserDashboard = () => {
  const user = getUserFromToken();

  return (
    <div className="dashboard-container">
      <h2>대시보드</h2>
      <p>환영합니다, {user?.email}님!</p>
      <div className="dashboard-content">
        <div className="card">
          <h3>👋 시작하기</h3>
          <p>좌측 메뉴에서 다양한 기능을 이용할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
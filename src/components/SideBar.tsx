import { Link } from 'react-router-dom';
import styles from '../scss/SideBar.module.scss';

const SideBar = () => {
  return (
    <div className={styles.sidebar}>
      <h3>🔧 메뉴</h3>
      <ul>
        <li><Link to="/">📊 대시보드</Link></li>
        <li><Link to="/nodes">🧩 노드 목록</Link></li>
        <li><Link to="/details">📝 노드 상세보기</Link></li>
        <li><Link to="/settings">⚙️ 설정</Link></li>
      </ul>
    </div>
  );
};

export default SideBar;
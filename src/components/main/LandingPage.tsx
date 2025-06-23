import React from 'react';
import GoogleLoginButton from '../user/GoogleLoginButton';
import styles from  './LandingPage.module.scss';

interface LandingPageProps {
    onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
    return (
        <div className={styles.landingContainer}>
            <div className={styles.landingContent}>
                <h1 className={styles.landingTitle}>Obscura</h1>
                <p className={styles.landingSubtitle}>
                    원격 노드 관리를 위한 강력하고 직관적인 올인원 솔루션.
                </p>
                <div className={styles.features}>
                    <div className={styles.featureItem}>
                        <h3>실시간 모니터링</h3>
                        <p>실시간 지표로 노드의 성능을 모니터링하세요.</p>
                    </div>
                    <div className={styles.featureItem}>
                        <h3>프로세스 관리</h3>
                        <p>노드에서 실행 중인 프로세스를 쉽게 확인하고 관리하세요.</p>
                    </div>
                    <div className={styles.featureItem}>
                        <h3>Docker 통합</h3>
                        <p>대시보드에서 직접 Docker 컨테이너와 이미지를 제어하세요.</p>
                    </div>
                    <div className={styles.featureItem}>
                        <h3>원격 터미널</h3>
                        <p>브라우저에서 노드에 대한 완전한 기능의 터미널에 접근하세요.</p>
                    </div>
                    <div className={styles.featureItem}>
                        <h3>서비스 제어</h3>
                        <p>SSH 없이도 시스템 서비스를 관리하세요.</p>
                    </div>
                </div>
                <div className={styles.loginSection}>
                    <GoogleLoginButton onLogin={onLogin} />
                </div>
            </div>
        </div>
    );
};

export default LandingPage; 
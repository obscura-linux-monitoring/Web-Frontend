import React from 'react';
import GoogleLoginButton from '../user/GoogleLoginButton';
import './LandingPage.css';

interface LandingPageProps {
    onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onLogin }) => {
    return (
        <div className="landing-container">
            <div className="landing-content">
                <h1 className="landing-title">Obscura</h1>
                <p className="landing-subtitle">
                    All-in-one solution for powerful and intuitive remote node management.
                </p>
                <div className="features">
                    <div className="feature-item">
                        <h3>Real-time Monitoring</h3>
                        <p>Keep track of your node's performance with live metrics.</p>
                    </div>
                    <div className="feature-item">
                        <h3>Process Management</h3>
                        <p>View and manage running processes on your nodes with ease.</p>
                    </div>
                    <div className="feature-item">
                        <h3>Docker Integration</h3>
                        <p>Control your Docker containers and images directly from the dashboard.</p>
                    </div>
                    <div className="feature-item">
                        <h3>Remote Terminal</h3>
                        <p>Access a fully functional terminal for your nodes in your browser.</p>
                    </div>
                    <div className="feature-item">
                        <h3>Service Control</h3>
                        <p>Manage system services without needing to SSH.</p>
                    </div>
                </div>
                <div className="login-section">
                    <GoogleLoginButton onLogin={onLogin} />
                </div>
            </div>
        </div>
    );
};

export default LandingPage; 
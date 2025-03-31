import { GoogleLogin } from '@react-oauth/google';
import api from '../api';


type Props = {
  onLogin?: () => void;  // ✅ 이거 추가!
};

const GoogleLoginButton = ({ onLogin }: Props) => {
  const handleLoginSuccess = async (credentialResponse: any) => {
    const idToken = credentialResponse.credential;

    if (!idToken) {
      console.error('No credential returned');
      return;
    }

    try {
      const res = await api.post('/auth/google', {
        id_token: idToken,
      });

      const { access_token, user } = res.data;
      console.log("✅ Login successful!");
      console.log("🔐 JWT:", access_token);
      console.log("👤 User:", user);
      
      // JWT 저장
      localStorage.setItem("jwt", access_token);

      onLogin?.(); // 콜백 실행
    } catch (err) {
      console.error('Error sending token to server:', err);
    }
  };

  return (
    <GoogleLogin
      onSuccess={handleLoginSuccess}
      onError={() => {
        console.log('Login Failed');
      }}
    />
  );
};

export default GoogleLoginButton;

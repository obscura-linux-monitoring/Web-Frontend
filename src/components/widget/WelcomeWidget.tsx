import React from 'react';
import Widget from './Widget';

interface WelcomeWidgetProps {
  id: string;
  email?: string;
  onClose?: () => void;
}

const WelcomeWidget: React.FC<WelcomeWidgetProps> = ({ id, email, onClose }) => {
  return (
    <Widget id={id} title="👋 시작하기" onClose={onClose}>
      <p>환영합니다, {email}님!</p>
    </Widget>
  );
};

export default WelcomeWidget; 
import './ErrorMessage.css';

interface ErrorMessageProps {
  message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message }) => (
  <div className="error-message">
    <span className="error-icon">⚠️</span>
    {message}
  </div>
); 
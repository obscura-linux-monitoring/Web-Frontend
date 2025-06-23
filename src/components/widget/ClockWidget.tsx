import React, { useState, useEffect } from 'react';
import Widget from './Widget';

const ClockWidget: React.FC<{ id: string; onClose?: () => void }> = ({ id, onClose }) => {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Widget id={id} title="현재 시간" onClose={onClose}>
      <div className="clock-widget">
        <p>{time.toLocaleTimeString()}</p>
      </div>
    </Widget>
  );
};

export default ClockWidget; 
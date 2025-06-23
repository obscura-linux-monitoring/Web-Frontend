import React from 'react';
import '../../scss/widget/widget.scss';

export interface WidgetProps {
  id: string;
  title: React.ReactNode;
  onClose?: () => void;
}

const Widget: React.FC<WidgetProps & React.PropsWithChildren> = ({
  id,
  title,
  children,
  onClose,
}) => {
  const handleClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    console.log(`Widget ${id}: 닫기 버튼 클릭됨`);
    // 이벤트 전파 중지 및 버블링 방지
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    // 상위 컴포넌트에서 제공한 onClose 콜백 실행
    if (onClose) {
      console.log(`Widget ${id}: onClose 콜백 실행`);
      onClose();
    } else {
      console.log(`Widget ${id}: onClose 콜백이 없음`);
    }
  };

  return (
    <div className="widget">
      <div className="widget-header">
        <div className="widget-drag-handle">
          <h3>{title}</h3>
        </div>
        {onClose && (
          <div className="widget-controls" onClick={e => e.stopPropagation()}>
            <button 
              type="button"
              onClick={handleClose} 
              className="close-btn"
              aria-label="위젯 닫기"
            >
              ×
            </button>
          </div>
        )}
      </div>
      <div className="widget-content">{children}</div>
    </div>
  );
};

export default Widget; 
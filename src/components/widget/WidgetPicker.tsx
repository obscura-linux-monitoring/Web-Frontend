import React, { useState } from 'react';
import '../../scss/widget/WidgetPicker.scss';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, EffectFade } from 'swiper/modules';
import ClockWidget from './ClockWidget';
import WelcomeWidget from './WelcomeWidget';
import CpuMetricsWidget from './CpuMetricsWidget';
import MemoryMetricsWidget from './MemoryMetricsWidget';
import DiskMetricsWidget from './DiskMetricsWidget';
import NetworkMetricsWidget from './NetworkMetricsWidget';

// Swiper 스타일 임포트
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/effect-fade';

// Swiper 타입 설정을 위한 인터페이스
declare module 'swiper/css';
declare module 'swiper/css/pagination';
declare module 'swiper/css/effect-fade';

interface WidgetOption {
  id: string;
  type: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  color?: string;
}

interface WidgetPickerProps {
  onClose: () => void;
  onSelectWidget: (type: string) => void;
}

const WidgetPicker: React.FC<WidgetPickerProps> = ({ onClose, onSelectWidget }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('모든 위젯');
  const [selectedWidget, setSelectedWidget] = useState<WidgetOption | null>(null);
  const [categoryWidgets, setCategoryWidgets] = useState<WidgetOption[]>([]);
  const [currentWidgetIndex, setCurrentWidgetIndex] = useState(0);
  
  const categories = [
    '모든 위젯',
    '시간',
    '정보',
    '시스템'
  ];
  
  const widgetOptions: WidgetOption[] = [
    // 시간 카테고리
    { id: 'clock', type: 'clock', title: '시계', description: '현재 시간을 보여줍니다', icon: '🕒', category: '시간' },
    
    // 정보 카테고리
    { id: 'welcome', type: 'welcome', title: '시작하기', description: '환영 메시지와 기본 정보를 표시합니다', icon: '👋', category: '정보'},
    
    // 시스템 카테고리
    { id: 'cpu_metrics', type: 'cpu_metrics', title: 'CPU 사용률', description: '노드의 CPU 사용률을 실시간으로 표시합니다', icon: '📈', category: '시스템', color: '#4ecdc4' },
    { id: 'memory_metrics', type: 'memory_metrics', title: '메모리 사용률', description: '노드의 메모리 사용률을 실시간으로 표시합니다', icon: '🧠', category: '시스템', color: '#ff6b6b' },
    { id: 'disk_metrics', type: 'disk_metrics', title: '디스크 사용률', description: '노드의 디스크 사용률을 실시간으로 표시합니다', icon: '💾', category: '시스템', color: '#ffe66d' },
    { id: 'network_metrics', type: 'network_metrics', title: '네트워크 트래픽', description: '노드의 네트워크 송수신 트래픽을 실시간으로 표시합니다', icon: '🌐', category: '시스템', color: '#50d890' },
  ];

  // 검색어와 카테고리로 필터링
  const filteredWidgets = widgetOptions.filter(widget => {
    const matchesSearch = widget.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         widget.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === '모든 위젯' || widget.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });
  
  // 카테고리 변경 시 해당 카테고리의 위젯 목록과 첫 번째 위젯 선택
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (category !== '모든 위젯') {
      const widgets = widgetOptions.filter(w => w.category === category);
      setCategoryWidgets(widgets);
      if (widgets.length > 0) {
        setSelectedWidget(widgets[0]);
        setCurrentWidgetIndex(0);
      }
    } else {
      setSelectedWidget(null);
      setCategoryWidgets([]);
    }
  };
  
  // 위젯 클릭 핸들러
  const handleWidgetClick = (widget: WidgetOption) => {
    setSelectedWidget(widget);
    if (selectedCategory !== '모든 위젯') {
      const index = categoryWidgets.findIndex(w => w.id === widget.id);
      if (index !== -1) {
        setCurrentWidgetIndex(index);
      }
    } else {
      // 모든 위젯 카테고리에서 클릭한 경우 해당 위젯 타입으로 바로 위젯 추가
      onSelectWidget(widget.type);
    }
  };
  
  // 슬라이드 변경 핸들러
  const handleSlideChange = (swiper: any) => {
    const index = swiper.activeIndex;
    if (index >= 0 && index < categoryWidgets.length) {
      setCurrentWidgetIndex(index);
      setSelectedWidget(categoryWidgets[index]);
    }
  };

  const renderWidgetPreview = (type: string) => {
    const widget = (() => {
      switch (type) {
        case 'clock':
          return <ClockWidget id={`preview-${type}`} onClose={() => {}} />;
        case 'welcome':
          return <WelcomeWidget id={`preview-${type}`} email="user@example.com" onClose={() => {}} />;
        case 'cpu_metrics':
          return (
            <CpuMetricsWidget 
              id={`preview-${type}`} 
              title="CPU 사용률"
              onClose={() => {}}
            />
          );
        case 'memory_metrics':
          return (
            <MemoryMetricsWidget 
              id={`preview-${type}`} 
              title="메모리 사용률"
              onClose={() => {}}
            />
          );
        case 'disk_metrics':
          return (
            <DiskMetricsWidget 
              id={`preview-${type}`} 
              title="디스크 사용률"
              onClose={() => {}}
            />
          );
        case 'network_metrics':
          return (
            <NetworkMetricsWidget 
              id={`preview-${type}`} 
              title="네트워크 트래픽"
              onClose={() => {}}
            />
          );
        default:
          return (
            <div className="preview-fallback">
              <div className="preview-icon">{widgetOptions.find(w => w.type === type)?.icon}</div>
              <div className="preview-title">{widgetOptions.find(w => w.type === type)?.title}</div>
            </div>
          );
      }
    })();

    return <div className="widget-preview-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', height: '100%' }}>{widget}</div>;
  };

  return (
    <div className="widget-picker-overlay" onClick={onClose}>
      <div className="widget-picker-container" onClick={e => e.stopPropagation()}>
        <div className="widget-picker-search">
          <div className="search-input-container">
            <span className="search-icon">🔍</span>
            <input 
              type="text" 
              placeholder="위젯 검색" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="widget-picker-main">
          <div className="widget-categories">
            {categories.map(category => (
              <div 
                key={category} 
                className={`category-item ${selectedCategory === category ? 'active' : ''}`}
                onClick={() => handleCategoryChange(category)}
              >
                {category}
              </div>
            ))}
          </div>
          
          <div className={`widget-grid-container ${selectedCategory !== '모든 위젯' && !searchTerm ? 'detail-view-mode' : ''}`}>
            {selectedCategory === '모든 위젯' || searchTerm ? (
              <>
                <h3>{selectedCategory === '모든 위젯' ? '추천 위젯' : selectedCategory}</h3>
                <div className="widget-grid">
                  {filteredWidgets.map(widget => (
                    <div 
                      key={widget.id} 
                      className="widget-option"
                      style={{ backgroundColor: widget.color || '#3a3a3a' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleWidgetClick(widget);
                      }}
                    >
                      <div className="widget-icon">{widget.icon}</div>
                      <div className="widget-title">{widget.title}</div>
                    </div>
                  ))}

                  {filteredWidgets.length === 0 && (
                    <div className="no-widgets-found">
                      <p>검색 결과가 없습니다</p>
                    </div>
                  )}
                </div>
              </>
            ) : selectedWidget && (
              <div className="widget-detail-view">
                <h2 className="widget-detail-title">{selectedWidget.title}</h2>
                <p className="widget-detail-description">{selectedWidget.description}</p>
                
                <div className="widget-slider-container">
                  <Swiper
                    modules={[Pagination, EffectFade]}
                    effect="fade"
                    fadeEffect={{
                      crossFade: true
                    }}
                    speed={300}
                    pagination={{
                      clickable: true,
                      el: '.widget-pagination'
                    }}
                    initialSlide={currentWidgetIndex}
                    onSlideChange={handleSlideChange}
                    className="widget-swiper"
                  >
                    {categoryWidgets.map((widget) => (
                      <SwiperSlide key={widget.id}>
                        <div className="widget-preview-wrapper">
                          {renderWidgetPreview(widget.type)}
                        </div>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                </div>
                
                <div className="widget-pagination"></div>
                
                <button 
                  className="add-widget-button"
                  onClick={() => onSelectWidget(selectedWidget.type)}
                >
                  위젯 추가
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="widget-picker-footer">
          <button className="close-button" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  );
};

export default WidgetPicker; 
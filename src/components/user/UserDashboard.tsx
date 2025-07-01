import { getUserFromToken } from '../../utils/Auth';
import { useState, useEffect, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import ClockWidget from '../widget/ClockWidget';
import WelcomeWidget from '../widget/WelcomeWidget';
import CpuMetricsWidget from '../widget/CpuMetricsWidget';
import MemoryMetricsWidget from '../widget/MemoryMetricsWidget';
import DiskMetricsWidget from '../widget/DiskMetricsWidget';
import NetworkMetricsWidget from '../widget/NetworkMetricsWidget';
import WidgetPicker from '../widget/WidgetPicker';

// 위젯 타입 정의
interface WidgetItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: string;
}

// 유효한 위젯 타입 목록
const VALID_WIDGET_TYPES = ['clock', 'welcome', 'cpu_metrics', 'memory_metrics', 'disk_metrics', 'network_metrics'];

const gridCol = 12;
const gridRow = 100;
const STORAGE_KEY = 'userDashboardWidgets';

const UserDashboard = () => {
  const user = getUserFromToken();
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWidgetPickerOpen, setIsWidgetPickerOpen] = useState(false);

  // 기본 위젯 설정
  const defaultWidgets: WidgetItem[] = [
    { i: 'clock-init', x: 0, y: 0, w: 2, h: 2, type: 'clock' },
    { i: 'welcome-init', x: 2, y: 0, w: 2, h: 2, type: 'welcome' },
  ];

  // 컨테이너 크기 측정
  useEffect(() => {
    if (!containerRef.current) return;

    // 초기 너비 설정
    setWidth(containerRef.current.offsetWidth);

    // ResizeObserver로 크기 변화 감지
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);

  // localStorage에서 위젯 설정 불러오기
  const loadWidgetsFromStorage = (): WidgetItem[] => {
    try {
      const userId = user?.email || 'anonymous';
      const storedWidgets = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
      if (storedWidgets) {
        const parsedWidgets = JSON.parse(storedWidgets);

        // 알 수 없는 위젯 타입 필터링
        const filteredWidgets = parsedWidgets.filter((widget: WidgetItem) =>
          VALID_WIDGET_TYPES.includes(widget.type)
        );

        // 필터링된 위젯이 원래 위젯 수와 다르면 다시 저장 (자동 정리)
        if (filteredWidgets.length !== parsedWidgets.length) {
          console.log(`알 수 없는 위젯 ${parsedWidgets.length - filteredWidgets.length}개가 삭제되었습니다.`);
          localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(filteredWidgets));
        }

        return filteredWidgets;
      }
    } catch (error) {
      console.error('Failed to load widgets from localStorage:', error);
    }
    return defaultWidgets;
  };

  // localStorage에 위젯 설정 저장하기
  const saveWidgetsToStorage = (widgetsToSave: WidgetItem[]) => {
    try {
      const userId = user?.email || 'anonymous';
      localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(widgetsToSave));
    } catch (error) {
      console.error('Failed to save widgets to localStorage:', error);
    }
  };

  // 초기 위젯 상태
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);

  // 컴포넌트 마운트 시 localStorage에서 위젯 설정 불러오기
  useEffect(() => {
    const savedWidgets = loadWidgetsFromStorage();
    setWidgets(savedWidgets);
  }, [user?.email]);

  // 위젯 상태가 변경될 때마다 localStorage에 저장
  useEffect(() => {
    if (widgets.length > 0) {
      saveWidgetsToStorage(widgets);
    }
  }, [widgets]);

  // 위젯 제거 함수
  const removeWidget = (id: string) => {
    console.log(`위젯 삭제 요청: ${id}`);
    setWidgets(prevWidgets => {
      const newWidgets = prevWidgets.filter(widget => widget.i !== id);
      console.log(`삭제 전 위젯 수: ${prevWidgets.length}, 삭제 후 위젯 수: ${newWidgets.length}`);
      return newWidgets;
    });
  };

  // 레이아웃 변경 처리
  const handleLayoutChange = (newLayout: GridLayout.Layout[]) => {
    setWidgets(prevWidgets => prevWidgets.map(widget => {
      const updatedLayout = newLayout.find(item => item.i === widget.i);
      if (updatedLayout) {
        return { ...widget, ...updatedLayout };
      }
      return widget;
    }));
  };

  // 위젯 렌더링 함수
  const renderWidget = (widget: WidgetItem) => {
    switch (widget.type) {
      case 'clock':
        return <ClockWidget id={widget.i} onClose={() => removeWidget(widget.i)} />;
      case 'welcome':
        return <WelcomeWidget id={widget.i} email={user?.email} onClose={() => removeWidget(widget.i)} />;
      case 'cpu_metrics':
        return (
          <CpuMetricsWidget
            id={widget.i}
            title="CPU 사용률"
            onClose={() => removeWidget(widget.i)}
          />
        );
      case 'memory_metrics':
        return (
          <MemoryMetricsWidget
            id={widget.i}
            title="메모리 사용률"
            onClose={() => removeWidget(widget.i)}
          />
        );
      case 'disk_metrics':
        return (
          <DiskMetricsWidget
            id={widget.i}
            title="디스크 사용률"
            onClose={() => removeWidget(widget.i)}
          />
        );
      case 'network_metrics':
        return (
          <NetworkMetricsWidget
            id={widget.i}
            title="네트워크 트래픽"
            onClose={() => removeWidget(widget.i)}
          />
        );
      default:
        // 알 수 없는 위젯 타입은 다음 렌더링 사이클에서 자동 제거됩니다.
        console.warn(`알 수 없는 위젯 타입: ${widget.type}`);
        setTimeout(() => removeWidget(widget.i), 0);
        return <div>알 수 없는 위젯</div>;
    }
  };

  // 다음 위젯을 위한 빈 위치 찾기
  const findEmptyPosition = (widgetType: string = 'default') => {
    // 기본 위치
    let newPos = { x: 0, y: 0 };

    // 위젯 타입에 따른 크기 결정
    const widgetWidth = widgetType.includes('metrics') ? 4 : 2;
    const widgetHeight = widgetType.includes('metrics') ? 3 : 2;

    // 현재 존재하는 위젯들의 위치 확인
    const occupiedPositions = widgets.map(widget => ({
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h
    }));

    // y 위치를 증가시키면서 비어있는 위치 찾기
    let posFound = false;
    for (let y = 0; y < 50 && !posFound; y++) {
      for (let x = 0; x <= gridCol - widgetWidth && !posFound; x++) {
        // 해당 위치에 위젯이 있는지 확인
        const overlapping = occupiedPositions.some(pos =>
          x < pos.x + pos.w &&
          x + widgetWidth > pos.x &&
          y < pos.y + pos.h &&
          y + widgetHeight > pos.y
        );

        if (!overlapping) {
          newPos = { x, y };
          posFound = true;
          break;
        }
      }
    }

    return newPos;
  };

  const addWidget = () => {
    setIsWidgetPickerOpen(true);
  };

  const handleSelectWidget = (type: string) => {
    const newPos = findEmptyPosition(type);

    // 메트릭스 위젯인 경우 크기를 3x3으로 설정
    const widgetSize = type.includes('metrics') ? { w: 4, h: 3 } : { w: 2, h: 2 };

    setWidgets(prevWidgets => [...prevWidgets, {
      i: `${type}-${Date.now()}`,
      x: newPos.x,
      y: newPos.y,
      ...widgetSize,
      type: type
    }]);
    setIsWidgetPickerOpen(false);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-content" ref={containerRef}>
        <div className="dashboard-header">
          {/* <h2>대시보드</h2> */}
          <div className="dashboard-controls">
            <button onClick={addWidget} className="add-widget-button">
              <span className="plus-icon">+</span> 위젯 추가
            </button>
          </div>
        </div>

        {width > 0 && (
          <GridLayout
            className="layout"
            layout={widgets}
            cols={gridCol}
            rowHeight={gridRow}
            width={width}
            onLayoutChange={handleLayoutChange}
            draggableHandle=".widget-drag-handle"
            verticalCompact={false}
            compactType={null}
            preventCollision={true}
            isDraggable={true}
            isResizable={true}
            maxRows={50}
          >
            {widgets.map(widget => (
              <div key={widget.i} className="widget-container">
                {renderWidget(widget)}
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {isWidgetPickerOpen && (
        <WidgetPicker
          onClose={() => setIsWidgetPickerOpen(false)}
          onSelectWidget={handleSelectWidget}
        />
      )}
    </div>
  );
};

export default UserDashboard;
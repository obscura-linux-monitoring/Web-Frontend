# React + TypeScript 프로젝트

## 소개
이 프로젝트는 React와 TypeScript를 사용하여 개발된 웹 애플리케이션입니다. Vite를 빌드 도구로 사용하여 빠른 개발 환경을 제공합니다.

## 설치 방법

# 저장소 클론
git clone https://github.com/yourusername/your-project-name.git

# 디렉토리 이동
cd your-project-name

# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

## 사용 가능한 스크립트

# 개발 서버 실행 (http://localhost:5173)
npm run dev

# 프로덕션용 빌드
npm run build

# 빌드된 앱 미리보기
npm run preview

# 린트 실행
npm run lint

# 테스트 실행
npm run test

## 프로젝트 구조
```
your-project-name/
├── public/             # 정적 파일
├── src/                # 소스 코드
│   ├── assets/         # 이미지, 폰트 등의 자산
│   ├── components/     # 재사용 가능한 컴포넌트
│   ├── hooks/          # 커스텀 훅
│   ├── pages/          # 페이지 컴포넌트
│   ├── services/       # API 서비스
│   ├── store/          # 상태 관리 (Redux/Context API)
│   ├── types/          # TypeScript 타입 정의
│   ├── utils/          # 유틸리티 함수
│   ├── App.tsx         # 애플리케이션 진입점
│   ├── main.tsx        # DOM 렌더링
│   └── vite-env.d.ts   # Vite 환경 타입
├── .eslintrc.cjs       # ESLint 설정
├── .gitignore          # Git 무시 파일 목록
├── index.html          # HTML 엔트리 포인트
├── package.json        # 프로젝트 의존성 및 스크립트
├── tsconfig.json       # TypeScript 설정
├── tsconfig.node.json  # Node.js TypeScript 설정
└── vite.config.ts      # Vite 설정
```
## 기술 스택

- **프론트엔드**: React, TypeScript
- **빌드 도구**: Vite
- **스타일링**: CSS/SCSS/Styled-Components/Tailwind CSS
- **상태 관리**: Context API/Redux/Zustand
- **테스팅**: Jest, React Testing Library
- **코드 품질**: ESLint, Prettier

## ESLint 설정 확장하기

프로덕션 애플리케이션을 개발하는 경우, 타입 검사 린트 규칙을 활성화하는 것이 좋습니다:

React 관련 린트 규칙을 위해 [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x)와 [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom)을 설치할 수도 있습니다:

## 기여 방법

1. 이 저장소를 포크합니다
2. 새로운 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋합니다 (`git commit -m 'Add some amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성합니다

## 라이센스

이 프로젝트는 MIT 라이센스 하에 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.

# Web-Toolbox 프로젝트 초기화 계획

이 계획서는 Next.js 14+를 사용하여 `web-toolbox` 프로젝트의 초기 환경을 구축하고 핵심 기능을 구현하기 위한 상세 내용을 담고 있습니다.

## 제안된 변경 사항

### [핵심 설정]

#### [INITIALIZE] [Next.js 프로젝트](file:///c:/web-toolbox)
`npx create-next-app@latest` 명령어를 사용하여 다음 설정으로 프로젝트를 초기화합니다:
- **프로젝트 이름**: `.` (현재 디렉토리)
- **TypeScript**: 사용함 (Yes)
- **ESLint**: 사용함 (Yes)
- **Tailwind CSS**: 사용 안 함 (No, Vanilla CSS 사용)
- **`src/` 디렉토리**: 사용함 (Yes)
- **App Router**: 사용함 (Yes)
- **Import Alias**: `@/*`

### [프로젝트 커스터마이징]

#### [MODIFY] [next.config.js](file:///c:/web-toolbox/next.config.js)
- 브라우저에서 `ffmpeg.wasm`을 사용하기 위해 필요한 `SharedArrayBuffer` 관련 보안 헤더를 설정합니다.

#### [MODIFY] [src/app/globals.css](file:///c:/web-toolbox/src/app/globals.css)
- CSS 변수를 활용하여 프리미엄 디자인 시스템(다크 모드, 그라데이션, 글래스모피즘 등)의 기초를 정의합니다.

## 검증 계획

### 자동화 테스트
- `npm run dev`: 개발 서버가 정상적으로 시작되는지 확인합니다.
- `npm run build`: 프로젝트가 오류 없이 빌드되는지 확인합니다.

### 수동 검증
- `http://localhost:3000`에 접속하여 초기 랜딩 페이지가 잘 보이는지 확인합니다.
- 각 도구(유튜브, 비디오, 이미지)를 위한 기본 라우팅이 작동하지 확인합니다.

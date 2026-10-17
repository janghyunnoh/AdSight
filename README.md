# AdSight

Lark 스프레드시트 데이터를 불러와 광고 성과 데이터를 탐색하고 비교하는 웹 애플리케이션입니다.

## 주요 기능

- **데이터 불러오기**: 스프레드시트 URL·토큰 및 Wiki 안의 Sheets 문서 지원
- **데이터 미리보기**: 시트 선택, 컬럼별 정렬, 최신 데이터 새로고침
- **대시보드**: 요약 카드, 기간·대상 필터, 여러 회사·캠페인의 추이 비교
- **지표 비교**: 광고비·클릭수·전환수 등을 그래프와 표로 함께 확인
- **개발 노트**: 필요한 기능 기록, 완료 상태 관리, 텍스트 내보내기

특이사항 자동 탐지와 AI 어시스턴트는 향후 구현 예정입니다.

## 기술 구성

Python 3.11 · FastAPI · HTML/CSS/JavaScript · Lark REST API

## 로컬 실행

```sh
conda env create -f environment.yml
conda activate adsight
cp .env.example .env
```

`.env`에 Lark 앱 ID와 Secret을 설정한 뒤 실행합니다.

```sh
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --no-access-log
```

브라우저에서 <http://127.0.0.1:8000>에 접속해 문서를 불러오세요. 앱에 Sheets 읽기 권한과 대상 문서 접근 권한이 필요하며, Wiki 링크는 Wiki 읽기 권한도 필요합니다.

## 참고

- 인증 정보는 서버의 환경변수·`.env`에서 관리하며 저장소에 포함하지 않습니다.
- 최근 문서와 개발 노트는 현재 브라우저에 저장됩니다.
- 현재는 개발용 MVP이며, 공개 운영 전 사용자 인증·접근 제어가 필요합니다.

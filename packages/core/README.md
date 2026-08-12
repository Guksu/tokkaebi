# @tokkaebi/core

[tokkaebi](https://github.com/Guksu/tokkaebi) 🧌의 엔진 패키지 — Claude Code 세션 로그 파싱, 모델 단가 계산, SQLite 저장, 집계 쿼리를 담당합니다.

CLI로 쓰려면 [`tokkaebi`](https://www.npmjs.com/package/tokkaebi)를 설치하세요:

```bash
npm install -g tokkaebi
```

이 패키지는 대시보드·MCP 서버 같은 다른 소비자를 만들 때 직접 사용합니다. 모든 API는 직렬화 가능한 plain object를 반환합니다.

```ts
import { openDatabase, syncUsage, getPeriodSummary, loadPricingTable } from "@tokkaebi/core";
```

지연에 민감한 경로(셸 프롬프트 등)에는 파서 의존성이 없는 경량 엔트리 `@tokkaebi/core/lite`를 사용하세요.

[MIT](https://github.com/Guksu/tokkaebi/blob/main/LICENSE)

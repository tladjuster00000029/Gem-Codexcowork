# Gemini + Codex cowork

제미나이가 계획을 세우고, 코덱스가 계획을 비판적으로 검토해 구현하며, 제미나이가 변경 내용과 테스트 보고서를 검토합니다. 문제가 있으면 코덱스가 다시 수정합니다. 최대 3회 구현·검토 후 검토용 초안 PR을 만듭니다. 기본 정책은 모든 변경을 사람이 새 OTP로 승인한 뒤 반영하는 것입니다.

## OTP 승인

`node approval/server.mjs`로 이 컴퓨터의 한국어 승인 화면을 엽니다. Google Authenticator에 승인용 항목을 직접 등록하고, PR 내용을 확인한 뒤 6자리 번호로 반영합니다. OTP는 Actions·채팅에 입력하지 않습니다. [자세한 등록·승인 안내](approval/사용안내.md)를 읽어주세요.

로컬 승인 경로와 표준 OTP 테스트는 구현됐습니다. GitHub 업로드·계정 연결·OTP 등록·저장소 보호 규칙 적용은 아직 완료되지 않았습니다. GitHub 일반 Merge 경로까지 OTP를 강제하려면 별도 병합 권한 분리와 보호 규칙 설정이 필요합니다. 중요하지 않은 작업도 현재는 예외 없이 OTP 대상이며 추후 사용자 요청으로만 정책을 바꿉니다.

## 처음 한 번 설정하기

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**에서 다음 두 값을 등록합니다.
   - `OPENAI_API_KEY`: OpenAI API 키
   - `GEMINI_API_KEY`: Gemini API 키
2. **Settings → Actions → General → Workflow permissions**에서 **Allow GitHub Actions to create and approve pull requests**를 켭니다. 조직 정책에 따라 관리자 설정이 필요할 수 있습니다. 워크플로가 PR 생성 작업에만 쓰기 권한을 요청합니다.
3. **Actions → Gemini + Codex cowork → Run workflow**에서 기본 브랜치를 선택합니다.
4. 작업 설명과 각 계정에서 사용할 수 있는 `gemini_model`, `codex_model` ID를 입력하고 실행합니다. 모델은 계정별 제공 범위가 달라 고정하지 않았습니다.

API 키를 채팅, 코드, 이슈에 붙여넣지 마세요. 이 구성은 각 서비스 API를 사용하며 웹 구독과 별도의 사용료·한도가 적용될 수 있습니다.

## 작업 예시

“한국어 할 일 목록 웹앱을 만들어줘. 추가, 완료 표시, 삭제를 지원하고 새로고침해도 목록이 유지돼야 해. 모바일 화면도 지원하고 저장 및 삭제 기능을 테스트해줘.”

현재 저장소는 자동화 틀입니다. 실제 앱이나 기존 프로젝트 코드를 추가하거나 첫 작업에서 앱 생성을 요청할 수 있습니다.

## 결과 확인

- **Pull requests**: 변경 코드와 계획·검토·테스트 보고서가 포함된 초안 PR
- **Actions 실행 → Artifacts → cowork-result**: 누적 변경 패치와 전체 협업 보고서
- 검토에 통과하면 조기 종료합니다. 3회 후에도 해결되지 않은 지적은 보고서에 남기고 초안 PR로 전달합니다.
- 변경 사항이 없으면 PR을 만들지 않습니다. API 오류·차단·잘린 응답·자동화 파일 변경 등은 실행 실패로 처리합니다.
- 제미나이는 파일 목록, README, 누적 변경 내용과 코덱스 보고서를 봅니다. 전체 저장소를 직접 탐색하거나 테스트를 독립 실행하지 않습니다. 테스트 결과는 코덱스 보고에 근거하므로 사람이 PR을 확인해야 합니다.
- 검토 입력은 180,000자로 제한합니다. 큰 작업은 나누어 실행하세요. 비밀 파일은 저장소에 넣지 마세요. 변경 내용은 두 서비스로 전달됩니다.
- 실행은 기본 브랜치에서 수동 시작하며, 이후 최대 3회 협업과 PR 제출은 자동입니다. 이슈나 PR 댓글만으로 실행되거나 자동 병합되지는 않습니다.
- 자동화 자체 수정은 일반 PR로 진행합니다. 자동 실행은 `.github/`, `approval/`, `scripts/cowork*.mjs`, `AGENTS.md`, `.gitignore`, `package.json`을 변경할 수 없습니다.

## 개발 확인

Node.js 24에서 `npm test`를 실행합니다. API가 없는 테스트는 검토 응답, 모의 협업 흐름, 표준 OTP 벡터, OTP 재사용 차단, 승인 버전 결속을 확인합니다. 실제 모델 호출·PR 생성·병합은 연결 설정 후 확인해야 합니다.

공식 참고: [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action), [Gemini generateContent](https://ai.google.dev/api/generate-content).

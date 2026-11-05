# Gemini 두 계정 + Codex SNS 업무 시스템

GitHub의 업무별 매뉴얼을 기준으로 Google Gemini 모델이 기획하고, ChatGPT 구독으로 로그인한 Codex CLI가 SNS 5종 원고를 작성하며, Google 모델이 검토합니다. Google 연결은 공식 후속 도구 Antigravity CLI를 사용합니다. 최종 결과는 사용자 승인 대기 상태로 PC에 저장됩니다.

## 시작

1. 공식 Antigravity CLI를 설치합니다. 현재 PC의 `.local-tools/agy/agy.exe`는 Google 공식 매니페스트 SHA512 검증을 통과한 1.5.1입니다. 설치 안내는 https://antigravity.google/docs/getting-started?tab=cli 입니다.
2. 한 PC에서 두 계정을 사용할 때는 `open-one-pc-setup.cmd`로 공유 설치를 준비한 뒤 Windows 사용자별로 `connect-google.cmd`를 열어 Google 구독을 연결합니다. 현재 사용자는 기획, SNSReview는 검토 역할입니다. 두 Windows 사용자 세션을 로그인 상태로 유지합니다. 실제 계정 분리와 Google 응답은 설치 후 확인해야 합니다. 개인 계정의 구형 Gemini CLI 지원은 2026-06-18 종료됐으며 공식 후속 도구 Antigravity를 사용합니다.
3. Codex CLI에서 ChatGPT로 로그인합니다. API 키 로그인은 사용하지 않습니다.
4. `open-sns.cmd`를 열어 도서 원고를 등록하고 결과를 확인합니다.
5. `scripts/register-sns-task.ps1`을 실행하면 로그인된 이 PC에서 15분마다 대기열을 확인합니다. PC 전원이 켜져 있어야 합니다.

## 작업 처리

- 원문 6,000자 이하는 즉시, 초과는 한국 시간 03:00~06:00에 처리하는 기본 규칙입니다. 소요 시간·사용량은 휴리스틱 예상값이며 구독 잔여량을 조회하지 않습니다.
- 급한 작업을 선택하면 길이에 관계없이 즉시 처리합니다. 실행 중인 작업 뒤에 순차 처리됩니다.
- 등록과 완료 알림은 Windows 알림 및 로컬 작업 화면에 남깁니다. Windows 설정에 따라 알림 표시가 제한될 수 있습니다.
- 로그인·한도·연결 오류는 일시 정지합니다. 해결 후 화면의 재시도로 완료한 계획 단계를 재사용할 수 있습니다.
- 출력은 브런치, 네이버 블로그, 인스타그램, 스레드 본문·답글, 카드 생성기 JSON입니다. 3개 이상 기계 검증이 실패하면 프로세스 검토 대상으로 멈춥니다. 1~2개 실패는 한 차례 최소 수정 후 재검증합니다.
- 모델 검토를 통과해도 사용자 승인 대기로 저장합니다. 실제 게시·배포·발송 연결은 최종 승인 기능을 붙인 뒤 활성화해야 합니다. 현재 버전은 로컬 원고 작성과 검토까지 수행합니다.

## 자료와 결과 위치

`playbooks/sns-writing/SKILL.md`가 SNS 업무의 마스터 매뉴얼입니다. `files/`에는 응답 구조와 재사용 도구 목록, `notes.md`에는 실패 레이어와 수정 기록을 둡니다.

PC의 UTF-8 텍스트는 `node scripts/sns-queue.mjs add 원고.txt`로 등록할 수 있습니다. 화면에서는 원고를 붙여넣습니다. Google Drive와 GitHub 자료는 연결 도구로 읽거나 내려받은 뒤 같은 입력으로 등록합니다. 이 버전의 무인 실행기는 Drive에서 직접 동기화하지 않습니다.

원문, 고정 안내문, 로그인 정보, 생성 결과는 `.runtime/` 아래 로컬에만 저장하며 Git에서 제외합니다. 브런치 41번에서 사용자가 지정한 고정 안내문은 현재 PC의 `.runtime/notices.md`에 있습니다. 다른 PC는 같은 자료를 별도로 준비해야 합니다.

카드 생성기의 `forest_green`과 문자열 `note` 형식을 사용합니다. 글자 수 검증은 렌더링 증명이 아니므로 이미지 잘림 확인은 실제 렌더 후 별도로 수행해야 합니다. 법적 내용은 원문 대조와 공식 출처 확인이 필요하며 모델 검토만으로 확정하지 않습니다.

## 검증

`node --test`로 대기열, 서울 시간 판정, 구독 인증 환경, 검증 실패 중단, 한도 오류 재개와 기존 OTP 승인 코드를 검사합니다. `node scripts/sns-validator.mjs 파일.json --publish`는 카드 데이터와 발행 링크를 검사합니다.

기존 API 키 기반 GitHub Actions와 `scripts/cowork.mjs` 실행 경로는 구독료 내 운영 정책에 맞춰 비활성화했습니다. GitHub에는 코드·매뉴얼·가상 테스트만 반영하며 실제 미승인 원고는 공개하지 않습니다.

공식 인증 문서 [Codex](https://learn.chatgpt.com/docs/auth?surface=cli), [Google 종료 공지](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals), [Antigravity 인증](https://antigravity.google/docs/install/).

# 지침 적용 우선순위

사용자가 제공한 네 레이어 원문은 `playbooks/_agent-builder/`에 보관합니다. 새 업무 매뉴얼은 레이어 1 인터뷰부터 시작하고, 기존 승인 매뉴얼은 해당 파일을 재사용합니다. 이번 SNS 업무는 사용자가 지정한 기존 매뉴얼을 적용했습니다. 이미 허용된 로컬 작업과 GitHub 코드 반영은 반복 승인을 요구하지 않으며 게시·배포·발송의 최종 승인권은 사용자에게 있습니다.

## 한 PC에서 Google 두 계정 실행

`open-one-pc-setup.cmd`는 관리자 설치 창을 열어 검토용 표준 Windows 사용자 `SNSReview`를 준비합니다. 현재 사용자에서 Gemini A 기획과 Codex 작성을 실행하고, 검토 작업은 `SNSReview`의 공식 Antigravity CLI로 전달합니다. 작업과 응답의 해시 및 Windows SID가 일치할 때만 결과를 받습니다. API 키 대체 호출은 없습니다.

암호는 설치 창에 직접 입력합니다. 검토 예약 작업은 SNSReview의 로그인 세션에서 실행하며 계정 암호를 예약 작업에 보관하지 않습니다. 두 Windows 사용자 세션을 로그인 상태로 유지해야 합니다. 최초 Google 로그인은 사용자별로 직접 완료해야 합니다. 다른 사용자로 실행한 CLI의 프로필 초기화와 구독 호출은 실제 PC에서 별도 확인이 필요합니다.

공유 코드 기본 위치는 `C:\Users\Public\Documents\SNSCowork`입니다. 조정 사용자가 코드와 대기열을 관리하고, 검토 사용자는 검토 수신 폴더에 결과를 쓸 수 있습니다. 새 작업 화면 기본 포트는 8766입니다. 설치 도중 실패하면 같은 설치를 검토한 뒤 `scripts/setup-one-pc.ps1 -UseExistingReviewer -Resume`으로 이어갈 수 있습니다.

## 다른 PC로 작업 이동

각 PC에서 GitHub 코드를 준비하고 해당 PC의 구독 로그인을 완료합니다. 새 Windows 사용자에서 공유 폴더의 connect-google.cmd를 열어 Google 구독을 연결합니다. 다음 명령은 그 PC의 저장소 폴더에서 실행합니다.

1. 원래 PC에서 `node scripts/sns-portable.mjs export 작업.sns-workspace.json`을 실행합니다. 실행 중인 작업이 있으면 완료 후 이동합니다. 내보내기에 성공하면 원래 PC의 대기열 실행이 인계 대기로 바뀝니다.
2. 생성된 파일을 이동할 PC에 전달합니다. 원고·검토 결과가 포함되므로 사용자가 정한 저장 위치를 사용하세요. 자동 외부 업로드는 수행하지 않습니다.
3. 새 PC에서 `node scripts/sns-portable.mjs import 작업.sns-workspace.json`을 실행하면 원문 스냅샷과 진행 단계에서 이어갈 수 있습니다.
4. 돌아올 때도 새 PC에서 내보내고 원래 PC에서 가져옵니다. 한 인계 파일은 선택한 한 PC에서만 가져오세요.

이동 파일에는 원문, 결과, 검토·오류 기록과 매뉴얼 스냅샷만 포함됩니다. 계정 암호, OAuth 저장소, API 키, 기기별 실행 경로와 OTP 승인 정보는 제외합니다. 가져오기 전에 파일 경로·해시·작업 상태를 검사하고, 수신 PC에 진행 중인 다른 작업 공간이 있으면 덮어쓰기를 막습니다. 교체 전 대기열은 같은 로컬 폴더의 `.queue-backup-*`에 보관합니다.

`backup`은 실행을 멈추지 않는 별도 백업이며, `cancel`은 다른 PC의 실행을 중지한 뒤 원래 PC의 인계를 취소할 때 사용합니다. 여러 수신 PC 간의 전역 실행 잠금은 없으므로 같은 인계 파일을 여러 PC에서 동시에 실행하지 마세요.

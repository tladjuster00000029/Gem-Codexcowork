# Gemini 두 계정 + Codex SNS 업무 시스템

GitHub의 업무별 매뉴얼을 기준으로 Gemini A가 기획하고, ChatGPT 구독으로 로그인한 Codex CLI가 SNS 5종 원고를 작성하며, Gemini B가 검토합니다. 최종 결과는 사용자 승인 대기 상태로 PC에 저장됩니다.

## 시작

1. Gemini 공식 CLI를 로컬 `.local-tools`에 설치합니다. 현재 PC에는 0.66.0이 설치되어 있습니다. 다른 PC에서는 `pnpm --dir .local-tools add @google/gemini-cli`를 실행하기 전에 폴더를 만드세요.
2. `scripts/login-gemini.ps1 -Account a`, `scripts/login-gemini.ps1 -Account b`를 각각 실행하고 서로 다른 구독 Google 계정으로 로그인합니다. 로그인 후 `/quit`으로 종료합니다.
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

공식 인증 문서 [Codex](https://learn.chatgpt.com/docs/auth?surface=cli), [Gemini CLI](https://geminicli.com/docs/get-started/authentication/).

# 지침 적용 우선순위

사용자가 제공한 네 레이어 원문은 `playbooks/_agent-builder/`에 보관합니다. 새 업무 매뉴얼은 레이어 1 인터뷰부터 시작하고, 기존 승인 매뉴얼은 해당 파일을 재사용합니다. 이번 SNS 업무는 사용자가 지정한 기존 매뉴얼을 적용했습니다. 이미 허용된 로컬 작업과 GitHub 코드 반영은 반복 승인을 요구하지 않으며 게시·배포·발송의 최종 승인권은 사용자에게 있습니다.

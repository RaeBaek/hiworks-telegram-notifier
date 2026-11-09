# Hiworks Telegram Notifier

**Hiworks Webhook과 Cloudflare Workers, Telegram Bot API를 활용한 서버리스 업무 알림 시스템**

Hiworks 업무 관리 서비스에서 발생하는 업무 등록, 수정, 삭제 이벤트를 Webhook으로 수신하고, Cloudflare Workers에서 데이터를 가공하여 Telegram 그룹 채팅으로 전달하는 알림 시스템입니다.

별도의 서버를 구축하거나 운영하지 않고, Cloudflare Workers의 서버리스 환경에서 Webhook 이벤트를 처리하도록 구현했습니다.

## 1. 프로젝트 개요

### Background

팀에서 Hiworks를 활용해 업무를 등록하고, 담당자를 지정하고, 진행 상태를 관리하고 있었습니다.

하지만 업무가 등록되거나 수정될 때마다 팀원들이 Hiworks에 직접 접속하여 변경 사항을 확인해야 하는 불편함이 있었습니다.

특히 여러 프로젝트와 담당자가 동시에 업무를 진행하는 환경에서는 새로운 업무나 상태 변경을 빠르게 파악할 수 있는 알림 수단이 필요했습니다.

이를 개선하기 위해 Hiworks Webhook과 Telegram Bot API를 연동하여 업무 이벤트를 자동으로 전달하는 시스템을 구축했습니다.

### Goals

- Hiworks 업무 등록, 수정, 삭제 이벤트 자동 감지
- Telegram 그룹 채팅으로 업무 알림 전달
- 업무 상태 및 주요 담당자 정보 제공
- OS 및 프로젝트별 업무 분류 정보 제공
- 업무 상세 내용의 줄바꿈 및 서식 유지
- Telegram 메시지에서 Hiworks 업무로 직접 이동
- 별도의 서버 운영 없이 서버리스 환경에서 실행

## 2. 기술 스택

| 기술 | 용도 |
|---|---|
| JavaScript | Webhook 처리 및 데이터 가공 |
| Cloudflare Workers | 서버리스 Webhook 수신 및 실행 |
| Hiworks Webhook API | 업무 이벤트 전달 |
| Telegram Bot API | 업무 알림 메시지 전송 |
| HTML | Telegram 메시지 서식 처리 |

### Cloudflare Workers를 선택한 이유

이번 프로젝트는 일반적인 웹 애플리케이션과 달리, 사용자의 요청에 지속적으로 응답하는 서버가 필요하지 않았습니다.

Hiworks에서 특정 이벤트가 발생했을 때 Webhook 요청을 수신하고, 데이터를 처리하여 Telegram API로 전달하는 구조였기 때문입니다.

따라서 별도의 서버 인스턴스를 운영하기보다는 이벤트 기반으로 실행되는 Cloudflare Workers가 적합하다고 판단했습니다.

이를 통해 서버 인프라 관리 부담을 줄이고, 간단한 배포 구조를 유지할 수 있었습니다.

## 3. 시스템 아키텍처

```text
┌──────────────────────┐
│       Hiworks        │
│                      │
│  업무 등록 / 수정 / 삭제  │
└──────────┬───────────┘
           │
           │ Webhook (HTTP POST)
           ▼
┌──────────────────────┐
│  Cloudflare Workers  │
│                      │
│  1. Webhook 인증      │
│  2. 이벤트 타입 검증     │
│  3. V2 Payload 파싱   │
│  4. 업무 데이터 추출     │
│  5. HTML 메시지 변환    │
└──────────┬───────────┘
           │
           │ Telegram Bot API
           ▼
┌──────────────────────┐
│       Telegram       │
│                      │
│    업무 알림 메시지      │
│    Hiworks 바로가기    │
└──────────────────────┘
```

### 동작 과정

1. Hiworks에서 업무가 등록, 수정 또는 삭제됩니다.
2. Hiworks Webhook이 Cloudflare Workers 엔드포인트로 HTTP POST 요청을 전송합니다.
3. Worker가 Webhook Secret을 검증합니다.
4. Webhook 이벤트 타입과 Payload 구조를 확인합니다.
5. 업무 제목, 상태, OS, 프로젝트, 담당자 등 필요한 정보를 추출합니다.
6. 업무 상세 설명의 HTML을 Telegram에서 지원하는 형식으로 변환합니다.
7. Telegram Bot API를 호출하여 그룹 채팅에 알림을 전송합니다.

## 4. 주요 기능

### 4.1 업무 이벤트별 알림

Hiworks V2 Webhook에서 제공하는 이벤트 타입을 구분하여 처리합니다.

| 이벤트 타입 | 설명 | Telegram 알림 |
|---|---|---|
| `CREATED_APP_DATA` | 업무 등록 | 🔔 Hiworks 업무 등록 |
| `UPDATED_APP_DATA` | 업무 수정 | ✏️ Hiworks 업무 수정 |
| `DELETED_APP_DATA` | 업무 삭제 | 🗑️ Hiworks 업무 삭제 |

지원하지 않는 이벤트 타입은 처리하지 않도록 구성했습니다.

### 4.2 업무 정보 추출

Hiworks V2 Payload에서 다음 정보를 추출합니다.

| 필드 | 설명 |
|---|---|
| 제목 | 업무 제목 |
| 상태 | 업무 진행 상태 |
| OS | Android, iOS 등 |
| 프로젝트 | 업무가 속한 프로젝트 |
| 담당자 | 업무 담당 인원 |
| 참조자 | 업무 참조 인원 |
| 등록자 | 최초 업무 등록자 |
| 마지막 편집자 | 최근 업무 수정자 |
| 내용 | 업무 상세 설명 |

담당자와 참조자는 여러 명이 지정될 수 있으므로 배열을 문자열로 변환하여 표시합니다.

값이 지정되지 않은 필드는 `미지정`, `없음` 등의 기본값을 표시하도록 처리했습니다.

### 4.3 OS 및 프로젝트 필드 처리

Hiworks V2에서는 사용자 정의 다중 선택 필드가 `multi_selection` 배열로 전달됩니다.

예시:

```json
{
  "multi_selection": [
    {
      "component_name": "OS",
      "value": ["Android", "iOS"]
    },
    {
      "component_name": "프로젝트",
      "value": ["국내", "튀르키예", "공통"]
    }
  ]
}
```

`component_name`으로 원하는 필드를 검색하고, 선택된 값을 쉼표로 연결하여 Telegram 메시지에 표시합니다.

```javascript
function getMultiSelectionValues(fields, componentName) {
  if (!Array.isArray(fields)) {
    return null;
  }

  const field = fields.find(
    item => item?.component_name === componentName
  );

  if (
    !field ||
    !Array.isArray(field.value) ||
    field.value.length === 0
  ) {
    return null;
  }

  return field.value.join(", ");
}
```

이를 통해 다음과 같은 정보를 제공할 수 있습니다.

```text
OS: Android, iOS
프로젝트: 국내, 공통
```

### 4.4 HTML 서식 변환

Hiworks 업무 상세 설명은 HTML 형식으로 전달됩니다.

단순히 HTML 태그를 제거하면 줄바꿈이나 취소선 등의 서식이 사라지는 문제가 있었습니다.

이를 해결하기 위해 Hiworks HTML을 Telegram에서 지원하는 HTML 형식으로 변환하는 로직을 구현했습니다.

| Hiworks HTML | Telegram HTML |
|---|---|
| `<strong>` | `<b>` |
| `<span style="font-weight: 700;">` | `<b>` |
| `<span style="text-decoration: line-through;">` | `<s>` |
| `<br>` | 줄바꿈 |
| `<p>` | 문단 구분 |

또한 사용자 입력값에 포함된 특수문자가 Telegram HTML로 잘못 해석되지 않도록 Escape 처리를 적용했습니다.

현재 구현에서는 이미지 태그를 제거하며, 본문 이미지를 Telegram 사진 메시지로 전달하는 기능은 포함하지 않습니다.

### 4.5 업무 바로가기

Telegram 알림에서 Hiworks 업무 상세 화면으로 직접 이동할 수 있도록 링크를 추가했습니다.

업무 URL은 Hiworks의 앱 ID와 업무 데이터 ID를 활용하여 생성합니다.

```javascript
const taskUrl =
  `https://tasks.office.hiworks.com/app` +
  `?appId=${encodeURIComponent(app.id)}` +
  `&filterId=${encodeURIComponent(filterId)}` +
  `&isGroup=true` +
  `&actionType=READ` +
  `&appDataId=${encodeURIComponent(appData.id)}`;
```

`filterId`는 실제 Hiworks 환경에서 사용하는 값으로 설정해야 합니다.

삭제된 업무는 상세 화면에 접근할 수 없으므로 삭제 이벤트에서는 바로가기 링크를 표시하지 않습니다.

Telegram 링크 미리보기는 비활성화하여 메시지의 가독성을 유지했습니다.

## 5. Telegram 알림 예시

다음은 실제 구현한 메시지 형식을 기반으로 한 예시입니다.

```text
✏️ Hiworks 업무 수정

제목: 모바일 앱 로그인 오류 수정

상태: 진행중
OS: Android, iOS
프로젝트: 국내, 공통

담당자: 홍길동
참조자: 김철수

등록자: 이영희
마지막 편집자: 홍길동

내용:
로그인 과정에서 발생하는 오류 수정

특정 조건에서 로그인 상태가
정상적으로 유지되지 않는 문제 확인

🔗 Hiworks에서 업무 확인
```

실제 Telegram 메시지에서는 제목 및 각 필드명이 굵게 표시되며, 마지막 바로가기 문구는 클릭 가능한 링크로 제공됩니다.

## 6. Webhook V1 → V2 마이그레이션

개발 과정에서 Hiworks Webhook Payload 구조가 V1에서 V2로 변경되었습니다.

이에 따라 기존 데이터 파싱 로직을 V2 구조에 맞게 수정했습니다.

### 주요 변경 사항

| 항목 | V1 | V2 |
|---|---|---|
| 이벤트 타입 | HTTP Header 기반 | `body.type` |
| 업무 데이터 | `components` 배열 | `data.task.app_data` |
| 업무 제목 | `TITLE` 컴포넌트 검색 | `app_data.title.value` |
| 업무 상태 | `STATUS` 컴포넌트 검색 | `app_data.status.value` |
| 담당자 | 컴포넌트 검색 | `app_data.assignee.value` |
| 참조자 | 컴포넌트 검색 | `app_data.referrer.value` |
| 등록자 | `body.owner` | `app_data.created_by.value` |
| 상세 설명 | `editor_content` | `description.content` |

V2에서는 주요 업무 정보가 명시적인 필드로 제공되므로, 기존보다 데이터 접근 구조를 단순화할 수 있었습니다.

또한 V2 Payload에 포함될 수 있는 `meta.v1_payload`에 의존하지 않고 V2 데이터만으로 처리하도록 구현했습니다.

## 7. 보안 처리

### Webhook Secret 검증

허용되지 않은 요청이 Telegram 알림을 발생시키지 않도록 Webhook Secret을 검증합니다.

```javascript
const webhookSecret = request.headers.get(
  "HIWORKS_WEBHOOK_SECRET"
);

if (
  !webhookSecret ||
  webhookSecret !== env.HIWORKS_WEBHOOK_SECRET
) {
  return new Response("Unauthorized", {
    status: 401
  });
}
```

### 환경변수 관리

다음 값은 소스 코드에 직접 작성하지 않고 Cloudflare Workers의 환경 설정에서 관리합니다.

| 환경변수 | 용도 |
|---|---|
| `HIWORKS_WEBHOOK_SECRET` | Webhook 요청 인증 |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API 인증 |
| `TELEGRAM_CHAT_ID` | Telegram 알림 대상 채팅 |

실제 토큰, Secret, 사내 식별자 및 업무 데이터는 공개 저장소에 포함하지 않습니다.

## 8. 오류 처리

Webhook 요청을 처리할 때 발생할 수 있는 오류에 대응하도록 HTTP 상태 코드를 구분했습니다.

| 상태 코드 | 설명 |
|---|---|
| 200 | 정상 처리 |
| 400 | 잘못된 이벤트 또는 Payload |
| 401 | Webhook 인증 실패 |
| 405 | 허용되지 않은 HTTP Method |
| 500 | Worker 내부 처리 오류 |
| 502 | Telegram API 호출 실패 |

Telegram API 호출 실패 시 오류 내용을 Cloudflare Workers 로그에 기록하여 원인을 확인할 수 있도록 구성했습니다.

## 9. 개발 과정에서 해결한 문제

### 9.1 Webhook Payload 구조 변경

> **문제**  
> Hiworks Webhook V1과 V2의 데이터 구조가 달라 기존 파싱 로직을 사용할 수 없었습니다.
>
> **해결**  
> Cloudflare Workers 로그를 통해 실제 V2 Payload를 분석하고, 이벤트 검증 및 필드 추출 로직을 V2 구조에 맞게 변경했습니다.

### 9.2 상세 설명의 줄바꿈 손실

> **문제**  
> `description.content_text` 사용 시 원본 업무 설명의 문단과 줄바꿈이 일부 손실되었습니다.
>
> **해결**  
> HTML 원본인 `description.content`를 사용하고, 문단 및 줄바꿈 태그를 Telegram에서 표현 가능한 형태로 변환했습니다.

### 9.3 취소선 및 굵은 글씨 손실

> **문제**  
> HTML 태그를 일괄 제거하면서 취소선과 굵은 글씨가 일반 텍스트로 표시되었습니다.
>
> **해결**  
> Hiworks의 HTML 태그와 인라인 스타일을 분석하여 Telegram에서 지원하는 `<b>`, `<s>` 태그로 변환했습니다.

### 9.4 Telegram 링크 미리보기

> **문제**  
> 업무 바로가기 링크를 포함하면 Telegram에서 링크 미리보기 카드가 생성되어 메시지가 길어졌습니다.
>
> **해결**  
> Telegram Bot API의 `link_preview_options.is_disabled` 옵션을 사용하여 링크 미리보기를 비활성화했습니다.

## 10. 향후 개선 사항

- Hiworks 본문 이미지의 Telegram 전송
- 업무 변경 전후 데이터 비교를 통한 변경 사항 강조
- 프로젝트별 Telegram 채팅방 분리
- Webhook 재전송에 대비한 중복 알림 방지
- 긴 업무 설명에 대한 메시지 분할 처리
- 자동화 테스트 추가

## 11. 프로젝트를 통해 얻은 경험

이번 프로젝트를 통해 기존 업무 시스템에서 제공하는 Webhook을 활용하여 팀의 협업 환경을 개선하는 경험을 할 수 있었습니다.

특히 별도의 백엔드 서버를 구축하지 않고 Cloudflare Workers를 활용해 외부 서비스 간 이벤트를 연결하고, 실제 Webhook Payload를 분석하여 데이터 구조 변경에 대응했습니다.

또한 Telegram 메시지의 가독성과 사용성을 개선하기 위해 데이터 추출, HTML 변환, 링크 처리 등의 기능을 구현했습니다.

단순한 API 연동을 넘어 실제 팀 업무 환경에서 발생하는 불편함을 해결하기 위한 자동화 시스템을 설계하고 구현했다는 점에서 의미 있는 프로젝트였습니다.

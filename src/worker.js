/**
 * Hiworks Telegram Notifier
 *
 * Hiworks Task Webhook V2 이벤트를 수신하여
 * Telegram 그룹 채팅으로 업무 알림을 전달하는 Cloudflare Worker.
 *
 * Supported events:
 * - CREATED_APP_DATA
 * - UPDATED_APP_DATA
 * - DELETED_APP_DATA
 *
 * Required environment variables:
 * - HIWORKS_WEBHOOK_SECRET
 * - HIWORKS_FILTER_ID
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID
 */

const SUPPORTED_EVENTS = [
  "CREATED_APP_DATA",
  "UPDATED_APP_DATA",
  "DELETED_APP_DATA"
];

const TELEGRAM_API_URL = "https://api.telegram.org";


export default {
  async fetch(request, env) {
    // POST 요청만 허용
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405
      });
    }

    // Hiworks Webhook 인증
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

    try {
      // Hiworks Webhook V2 Payload
      const body = await request.json();

      // Hiworks Task 이벤트인지 확인
      if (body.solution !== "task") {
        return new Response("Invalid Solution", {
          status: 400
        });
      }

      const eventType = body.type;

      // 지원하는 이벤트 타입인지 확인
      if (!SUPPORTED_EVENTS.includes(eventType)) {
        return new Response("Invalid Event Type", {
          status: 400
        });
      }

      // Task 데이터 추출
      const task = body.data?.task;
      const app = task?.app;
      const appData = task?.app_data;

      if (!app?.id || !appData?.id) {
        console.error("Invalid Hiworks V2 Payload");

        return new Response("Invalid Payload", {
          status: 400
        });
      }

      // 업무 정보 추출
      const taskInfo = extractTaskInfo(
        body,
        appData
      );

      // 업무 바로가기 URL 생성
      const taskUrl = createTaskUrl(
        app.id,
        appData.id,
        env.HIWORKS_FILTER_ID
      );

      // Telegram 메시지 생성
      const message = createTelegramMessage(
        eventType,
        taskInfo,
        taskUrl
      );

      // Telegram 메시지 전송
      const telegramResponse = await sendTelegramMessage(
        env,
        message
      );

      if (!telegramResponse.ok) {
        console.error(
          "Telegram API Error:",
          telegramResponse.status
        );

        return new Response("Telegram API Error", {
          status: 502
        });
      }

      return new Response("OK", {
        status: 200
      });

    } catch (error) {
      console.error(
        "Worker Error:",
        error instanceof Error
          ? error.name
          : "UnknownError"
      );

      return new Response("Internal Server Error", {
        status: 500
      });
    }
  }
};


/**
 * Hiworks V2 Payload에서 업무 정보 추출
 */
function extractTaskInfo(body, appData) {
  return {
    // 제목
    title:
      appData.title?.value ??
      body.text ??
      "제목 없음",

    // 상태
    status:
      appData.status?.value ??
      "상태 없음",

    // OS
    os:
      getMultiSelectionValues(
        appData.multi_selection,
        "OS"
      ) ??
      "미지정",

    // 프로젝트
    projects:
      getMultiSelectionValues(
        appData.multi_selection,
        "프로젝트"
      ) ??
      "미지정",

    // 담당자
    assignee:
      getUserNames(
        appData.assignee?.value
      ) ??
      "미지정",

    // 참조자
    references:
      getUserNames(
        appData.referrer?.value
      ) ??
      "없음",

    // 등록자
    owner:
      appData.created_by?.value?.user_name ??
      "알 수 없음",

    // 마지막 편집자
    lastModifiedBy:
      appData.last_modified_by?.value?.user_name ??
      "알 수 없음",

    // 상세 설명
    content:
      convertHiworksToTelegramHtml(
        appData.description?.content ?? ""
      ) ||
      escapeHtml(
        appData.description?.content_text?.trim() ?? ""
      ) ||
      "내용 없음"
  };
}


/**
 * Hiworks 업무 바로가기 URL 생성
 */
function createTaskUrl(appId, appDataId, filterId) {
  const params = new URLSearchParams({
    appId,
    isGroup: "true",
    actionType: "READ",
    appDataId
  });

  if (filterId) {
    params.set("filterId", filterId);
  }

  return `https://tasks.office.hiworks.com/app?${params.toString()}`;
}


/**
 * 이벤트 타입에 따른 Telegram 메시지 제목
 */
function getEventMessage(eventType) {
  switch (eventType) {
    case "CREATED_APP_DATA":
      return "🔔 Hiworks 업무 등록";

    case "UPDATED_APP_DATA":
      return "✏️ Hiworks 업무 수정";

    case "DELETED_APP_DATA":
      return "🗑️ Hiworks 업무 삭제";

    default:
      return "🔔 Hiworks 업무 관리 알림";
  }
}


/**
 * Telegram 알림 메시지 생성
 */
function createTelegramMessage(
  eventType,
  taskInfo,
  taskUrl
) {
  const {
    title,
    status,
    os,
    projects,
    assignee,
    references,
    owner,
    lastModifiedBy,
    content
  } = taskInfo;

  const eventMessage = getEventMessage(eventType);

  // 메시지 표시 순서
  //
  // 제목
  //
  // 상태 / OS / 프로젝트
  //
  // 담당자 / 참조자
  //
  // 등록자 / 마지막 편집자
  //
  // 내용
  const messageParts = [
    `<b>${escapeHtml(eventMessage)}</b>`,
    "",
    `<b>제목:</b> ${escapeHtml(title)}`,
    "",
    `<b>상태:</b> ${escapeHtml(status)}`,
    `<b>OS:</b> ${escapeHtml(os)}`,
    `<b>프로젝트:</b> ${escapeHtml(projects)}`,
    "",
    `<b>담당자:</b> ${escapeHtml(assignee)}`,
    `<b>참조자:</b> ${escapeHtml(references)}`,
    "",
    `<b>등록자:</b> ${escapeHtml(owner)}`,
    `<b>마지막 편집자:</b> ${escapeHtml(lastModifiedBy)}`,
    "",
    `<b>내용:</b>`,
    content
  ];

  // 삭제된 업무는 바로가기 링크 제외
  if (eventType !== "DELETED_APP_DATA") {
    messageParts.push(
      "",
      `<a href="${escapeHtml(taskUrl)}">🔗 Hiworks에서 업무 확인</a>`
    );
  }

  return messageParts.join("\n");
}


/**
 * Telegram Bot API 메시지 전송
 */
async function sendTelegramMessage(env, message) {
  const url =
    `${TELEGRAM_API_URL}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: "HTML",

      // 링크 미리보기 비활성화
      link_preview_options: {
        is_disabled: true
      }
    })
  });
}


/**
 * Hiworks 사용자 정보에서 이름 추출
 */
function getUserNames(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const names = value
      .map(getSingleUserName)
      .filter(Boolean);

    return names.length > 0
      ? names.join(", ")
      : null;
  }

  if (typeof value === "object") {
    return getSingleUserName(value);
  }

  return String(value);
}


/**
 * 사용자 객체 하나에서 이름 추출
 */
function getSingleUserName(user) {
  if (!user) {
    return null;
  }

  if (typeof user === "string") {
    return user;
  }

  return (
    user.user_name ??
    user.name ??
    user.userName ??
    user.label ??
    null
  );
}


/**
 * Hiworks V2 다중 선택 필드 처리
 *
 * Example:
 * [
 *   {
 *     component_name: "OS",
 *     value: ["Android", "iOS"]
 *   }
 * ]
 *
 * Result:
 * "Android, iOS"
 */
function getMultiSelectionValues(
  fields,
  componentName
) {
  if (!Array.isArray(fields)) {
    return null;
  }

  const field = fields.find(
    item =>
      item?.component_name === componentName
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


/**
 * Hiworks HTML을 Telegram HTML로 변환
 *
 * Supported:
 * - Paragraphs
 * - Line breaks
 * - Bold
 * - Strikethrough
 * - Lists
 */
function convertHiworksToTelegramHtml(html) {
  if (!html) {
    return "";
  }

  let result = html;

  // HTML 공백 변환
  result = result.replace(
    /&nbsp;/gi,
    " "
  );

  // 취소선 변환
  result = result.replace(
    /<span[^>]*style="[^"]*text-decoration:\s*line-through;?[^"]*"[^>]*>(.*?)<\/span>/gis,
    "<s>$1</s>"
  );

  // Bold 변환
  result = result.replace(
    /<span[^>]*style="[^"]*font-weight:\s*(?:700|bold);?[^"]*"[^>]*>(.*?)<\/span>/gis,
    "<b>$1</b>"
  );

  // strong → b
  result = result
    .replace(/<strong[^>]*>/gi, "<b>")
    .replace(/<\/strong>/gi, "</b>");

  // strike → s
  result = result
    .replace(/<strike[^>]*>/gi, "<s>")
    .replace(/<\/strike>/gi, "</s>");

  // 빈 문단
  result = result.replace(
    /<p[^>]*>\s*<br\s*\/?>\s*<\/p>/gi,
    "\n\n"
  );

  // 줄바꿈
  result = result.replace(
    /<br\s*\/?>/gi,
    "\n"
  );

  // 문단 종료
  result = result
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n");

  // 리스트
  result = result.replace(
    /<li[^>]*>/gi,
    "• "
  );

  // 이미지 제거
  result = result.replace(
    /<img[^>]*>/gi,
    ""
  );

  // Telegram HTML 태그 보호
  result = result
    .replace(/<b>/gi, "___TG_B_OPEN___")
    .replace(/<\/b>/gi, "___TG_B_CLOSE___")
    .replace(/<s>/gi, "___TG_S_OPEN___")
    .replace(/<\/s>/gi, "___TG_S_CLOSE___");

  // 나머지 HTML 태그 제거
  result = result.replace(
    /<[^>]+>/g,
    ""
  );

  // HTML Escape
  result = escapeHtml(result);

  // Telegram HTML 태그 복원
  result = result
    .replace(/___TG_B_OPEN___/g, "<b>")
    .replace(/___TG_B_CLOSE___/g, "</b>")
    .replace(/___TG_S_OPEN___/g, "<s>")
    .replace(/___TG_S_CLOSE___/g, "</s>");

  // HTML Entity 중복 Escape 정리
  result = result
    .replace(/&amp;amp;/g, "&amp;")
    .replace(/&amp;quot;/g, "&quot;")
    .replace(/&amp;#39;/g, "&#39;")
    .replace(/&amp;lt;/g, "&lt;")
    .replace(/&amp;gt;/g, "&gt;");

  // 줄바꿈 정리
  result = result
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}


/**
 * Telegram HTML 특수문자 Escape
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
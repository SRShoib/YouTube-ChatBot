function getVideoIdFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get("v");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFirstText(selectors) {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const text = element?.textContent?.replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function getTitleFromDom() {
  const title =
    getFirstText([
      "ytd-watch-metadata h1 yt-formatted-string",
      "ytd-watch-metadata h1",
      "h1.title yt-formatted-string",
      "h1.ytd-watch-metadata"
    ]) ||
    document.querySelector('meta[name="title"]')?.content?.trim() ||
    document.querySelector('meta[property="og:title"]')?.content?.trim();

  if (title) {
    return title;
  }

  return document.title.replace(" - YouTube", "").trim();
}

function getTranscriptRows() {
  const selectors = [
    "ytd-transcript-segment-renderer",
    "ytd-transcript-segment-list-renderer ytd-transcript-segment-renderer",
    "ytd-engagement-panel-section-list-renderer ytd-transcript-segment-renderer"
  ];

  for (const selector of selectors) {
    const rows = Array.from(document.querySelectorAll(selector));
    if (rows.length) {
      return rows;
    }
  }

  return [];
}

function findTranscriptButton() {
  const candidates = Array.from(document.querySelectorAll("button, tp-yt-paper-button, yt-button-shape button"));

  return candidates.find((element) => {
    const text = element.textContent?.replace(/\s+/g, " ").trim().toLowerCase();
    const ariaLabel = element.getAttribute("aria-label")?.toLowerCase() || "";
    return text?.includes("transcript") || ariaLabel.includes("transcript");
  }) || null;
}

async function openMoreActionsMenuIfNeeded() {
  const moreActionsButton =
    document.querySelector('button[aria-label*="More actions"]') ||
    document.querySelector('yt-button-shape button[aria-label*="more"]') ||
    document.querySelector('button[aria-label*="Action menu"]');

  if (!moreActionsButton) {
    return false;
  }

  moreActionsButton.click();
  await sleep(500);
  return true;
}

async function ensureTranscriptOpen() {
  if (getTranscriptRows().length) {
    return true;
  }

  let transcriptButton = findTranscriptButton();
  if (!transcriptButton) {
    await openMoreActionsMenuIfNeeded();
    transcriptButton = findTranscriptButton();
  }

  if (!transcriptButton) {
    return false;
  }

  transcriptButton.click();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    await sleep(400);
    if (getTranscriptRows().length) {
      return true;
    }
  }

  return false;
}

function getTranscriptSegments() {
  const rows = getTranscriptRows();
  const segments = [];
  const seen = new Set();

  rows.forEach((row) => {
    const timestamp =
      getFirstTextFromRow(row, [
        ".segment-timestamp",
        "#segment-start-offset",
        '[class*="timestamp"]',
        'yt-formatted-string[role="text"]'
      ]) || "unknown";
    const text = getFirstTextFromRow(row, [
      ".segment-text",
      "#segment-text",
      '[class*="segment-text"] yt-formatted-string',
      '[id*="segment-text"] yt-formatted-string',
      ".segment-text yt-formatted-string",
      "yt-formatted-string"
    ]);
    const key = `${timestamp}|${text}`;

    if (text && !seen.has(key)) {
      seen.add(key);
      segments.push({
        timestamp,
        text
      });
    }
  });

  return segments;
}

function getFirstTextFromRow(row, selectors) {
  for (const selector of selectors) {
    const element = row.querySelector(selector);
    const text = element?.textContent?.replace(/\s+/g, " ").trim();
    if (text) {
      return text;
    }
  }

  return "";
}

async function extractTranscriptPayload() {
  const videoId = getVideoIdFromUrl();
  const title = getTitleFromDom();

  if (!videoId) {
    throw new Error("This page does not look like a YouTube watch page.");
  }

  await ensureTranscriptOpen();
  const transcript = getTranscriptSegments();

  if (!transcript.length) {
    throw new Error(
      "Transcript not found. The extension tried to open it automatically. If needed, open the YouTube transcript panel manually and try again."
    );
  }

  return {
    videoId,
    title,
    transcript
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return;
  }

  if (message.type !== "GET_TRANSCRIPT") {
    return;
  }

  extractTranscriptPayload()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

// TODO: replace with your deployed Render URL, e.g. "https://your-app.onrender.com"
const BACKEND_URL = "https://youtube-chatbot-tzq1.onrender.com";

const loadTranscriptBtn = document.getElementById("loadTranscriptBtn");
const askBtn = document.getElementById("askBtn");
const statusEl = document.getElementById("status");
const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fecaca" : "#ecfdf5";
}

function setAnswer(message, isError = false) {
  answerEl.textContent = message;
  answerEl.style.color = isError ? "#fecaca" : "#f0fdf4";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function sendMessageToContentScript(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function ensureContentScript(tabId) {
  try {
    await sendMessageToContentScript(tabId, { type: "PING" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  }
}

async function saveCurrentVideo(videoId) {
  await chrome.storage.local.set({ currentVideoId: videoId });
}

async function clearCurrentVideo() {
  await chrome.storage.local.remove(["currentVideoId"]);
}

async function getCurrentVideo() {
  const data = await chrome.storage.local.get(["currentVideoId"]);
  return data.currentVideoId;
}

async function readJsonSafely(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return { detail: text };
  }
}

function formatWaitTime(seconds) {
  const totalSeconds = Number(seconds);
  if (!totalSeconds || totalSeconds <= 0) {
    return "a little while";
  }

  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) {
    return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

function readErrorMessage(response, data, fallback) {
  if (response.status === 429) {
    const waitTime = formatWaitTime(response.headers.get("Retry-After"));
    return `This shared demo backend has a usage limit to keep it free for everyone. Please try again in ${waitTime}.`;
  }

  return data.detail || fallback;
}

function getVideoIdFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("v");
  } catch (error) {
    return null;
  }
}

async function isVideoIndexed(videoId) {
  try {
    const response = await fetch(`${BACKEND_URL}/video-status/${videoId}`);
    const data = await readJsonSafely(response);
    return Boolean(response.ok && data.indexed);
  } catch (error) {
    return false;
  }
}

async function loadTranscript() {
  try {
    setStatus("Loading transcript...");
    setAnswer("Your answer will appear here.");
    await clearCurrentVideo();

    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url || !tab.url.includes("youtube.com/watch")) {
      throw new Error("Please open a YouTube watch page first.");
    }

    await ensureContentScript(tab.id);

    const response = await sendMessageToContentScript(tab.id, {
      type: "GET_TRANSCRIPT"
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || "Could not read transcript from the page.");
    }

    const indexResponse = await fetch(`${BACKEND_URL}/index-video`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(response.data)
    });

    const indexData = await readJsonSafely(indexResponse);
    if (!indexResponse.ok) {
      throw new Error(readErrorMessage(indexResponse, indexData, "Failed to index transcript."));
    }

    await saveCurrentVideo(response.data.videoId);
    setStatus(`Transcript indexed for: ${response.data.title}`);
  } catch (error) {
    await clearCurrentVideo();
    setStatus(error.message || "Failed to load transcript.", true);
    setAnswer(error.message || "Failed to load transcript.", true);
  }
}

async function askQuestion() {
  try {
    const question = questionEl.value.trim();
    if (!question) {
      throw new Error("Please enter a question.");
    }

    const tab = await getActiveTab();
    const activeVideoId = getVideoIdFromUrl(tab?.url);
    let videoId = await getCurrentVideo();
    if (!videoId) {
      throw new Error("Load a transcript before asking a question.");
    }
    if (activeVideoId && activeVideoId !== videoId) {
      throw new Error("This is a different video. Load the transcript again.");
    }

    setStatus("Checking transcript...");
    if (!(await isVideoIndexed(videoId))) {
      // The free-tier backend sleeps when idle and forgets indexed videos on
      // wake. Reload silently instead of surfacing a confusing wrong answer.
      setStatus("Backend woke up and forgot this video. Reloading transcript...");
      await loadTranscript();
      videoId = await getCurrentVideo();
      if (!videoId) {
        throw new Error("Could not reload the transcript. Try again.");
      }
    }

    setStatus("Asking question...");
    setAnswer("Thinking...");

    const response = await fetch(`${BACKEND_URL}/rag/invoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: {
          video_id: videoId,
          question
        }
      })
    });

    const data = await readJsonSafely(response);
    if (!response.ok) {
      throw new Error(readErrorMessage(response, data, "Failed to get an answer."));
    }

    const answer =
      data?.output?.answer ||
      data?.answer ||
      data?.output ||
      "I couldn't find that in the transcript.";

    setAnswer(answer);
    setStatus("Answer received.");
  } catch (error) {
    const message = error.message || "Something went wrong.";
    setAnswer(message, true);
    setStatus(message, true);
  }
}

loadTranscriptBtn.addEventListener("click", loadTranscript);
askBtn.addEventListener("click", askQuestion);

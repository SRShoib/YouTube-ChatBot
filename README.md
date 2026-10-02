# YouTube ChatBot MVP

This project is a minimal end-to-end YouTube RAG chatbot with:

- a Chrome Extension that runs on YouTube watch pages
- a FastAPI backend
- LangServe routes for question answering
- FAISS in-memory vector search
- OpenAI embeddings and chat model

The backend is hosted; you only need to install the extension. See below.

## Install the Extension

1. Click the green **Code** button at the top of this repo → **Download ZIP**, then unzip it.
2. Open a YouTube video and **open the transcript panel first** (below the video, click **...more** → **Show transcript**). The extension reads the transcript from the page, so it has to already be open.
3. Go to `chrome://extensions/` in Chrome.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the `extension` folder *inside* the unzipped folder — not the top-level repo folder.
6. Click the extension icon in the toolbar, then **Load Transcript**.
7. Once it says the transcript is indexed, type a question and click **Ask**.

**First use may be slow.** The backend is hosted on a free tier that sleeps after 15 minutes of no activity. If nothing has used it recently, the first request can take up to a minute to wake up — this is normal, just wait.

## Architecture

1. The Chrome extension popup asks the content script to read the current YouTube page.
2. The content script extracts the `videoId`, title, and transcript segments from the DOM.
3. The popup sends that transcript to `POST /index-video`.
4. The backend splits the transcript into chunks, embeds them once, and stores them in FAISS by `videoId`.
5. The popup sends user questions to `POST /rag/invoke`.
6. The RAG chain retrieves the most relevant transcript chunks and asks `ChatOpenAI` to answer only from those chunks.

## Project Structure

```text
extension/
  manifest.json
  popup.html
  popup.css
  popup.js
  content.js
  background.js

backend/
  app.py
  rag_chain.py
  store.py
  requirements.txt
  .env.example
  README.md

README.md
```

## Run Your Own Backend (optional)

The steps above use the hosted backend baked into the extension. If you'd rather run your own — for development, or to avoid sharing the hosted one — follow this section, then update `BACKEND_URL` in `extension/popup.js` and the matching entry in `extension/manifest.json`'s `host_permissions` to point at your own backend before loading the extension.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Add your OpenAI API key to `backend/.env`.

If you want tracing in LangSmith, also fill in the LangSmith values already included in `backend/.env.example`:

- `LANGSMITH_API_KEY`
- `LANGSMITH_TRACING=true`
- `LANGSMITH_PROJECT=youtube-rag-chatbot`

### 2. Run backend

```powershell
cd backend
.venv\Scripts\activate
uvicorn app:app --reload
```

Open `http://127.0.0.1:8000/health` and confirm it returns:

```json
{"ok": true}
```

### 3. Load the Chrome extension

1. Open Chrome and go to `chrome://extensions/`
2. Turn on Developer mode
3. Click Load unpacked
4. Select the `extension/` folder

### Deploying the backend to Render

1. Push `backend/` to a GitHub repo (already done here).
2. On [Render](https://render.com), create a **New Web Service** from this repo.
3. Set:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1`
   - Health Check Path: `/health`
4. Add environment variable `OPENAI_API_KEY` (and the LangSmith ones if you use tracing).
5. Keep the instance count at 1 — the vector store lives in the process's memory, so more than one instance means indexing and answering can land on different instances with no shared data.
6. Once deployed, update `BACKEND_URL` in `extension/popup.js` and the matching URL in `extension/manifest.json`'s `host_permissions`, then reload the extension.

## How to Test

1. Start the backend.
2. Open a YouTube watch page.
3. Manually open the transcript panel on YouTube.
4. Open the extension popup.
5. Click `Load Transcript`.
6. Wait for the success status.
7. Ask a question in the textarea.
8. Click `Ask`.

## Known Limitations

- Transcript extraction is DOM-based, so it depends on YouTube's current page structure.
- For this MVP, the transcript panel may need to be opened manually before loading.
- FAISS is stored only in memory (capped at the 50 most recently used videos), so indexed videos are lost when the backend restarts or sleeps. The popup checks `GET /video-status/{video_id}` before asking a question and silently re-indexes if the backend forgot the video.
- The hosted backend has no auth, since anyone downloading the extension shares it — an OpenAI spend cap is the safeguard against abuse, not a backend password.
- The hosted backend rate-limits by network: 10 transcript loads and 20 questions per hour. Going over shows a "try again in X minutes" message instead of an answer.
- This version uses `POST /rag/invoke`; `POST /rag/stream` is available for future streaming UI work but is not used in the popup yet.
- LangSmith tracing is optional and only works after setting the LangSmith environment variables and restarting the backend.

## Local Run Commands

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

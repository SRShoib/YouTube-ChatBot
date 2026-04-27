# YouTube ChatBot MVP

This project is a minimal end-to-end YouTube RAG chatbot with:

- a Chrome Extension that runs on YouTube watch pages
- a FastAPI backend
- LangServe routes for question answering
- FAISS in-memory vector search
- OpenAI embeddings and chat model

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

## Setup

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
- FAISS is stored only in memory, so indexed videos are lost when the backend restarts.
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

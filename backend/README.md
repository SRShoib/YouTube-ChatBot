# Backend Setup

This backend exposes:

- `GET /health`
- `POST /index-video`
- LangServe routes under `/rag`, including `POST /rag/invoke` and `POST /rag/stream`

## 1. Create a virtual environment

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
```

## 2. Install dependencies

```powershell
pip install -r requirements.txt
```

## 3. Configure environment variables

```powershell
copy .env.example .env
```

Then put your OpenAI API key inside `.env`.

If you want LangSmith tracing, also add your LangSmith API key. The provided `.env.example` already includes:

- `LANGSMITH_API_KEY`
- `LANGSMITH_TRACING=true`
- `LANGSMITH_PROJECT=youtube-rag-chatbot`

## 4. Run the server

```powershell
uvicorn app:app --reload
```

The backend will start at `http://127.0.0.1:8000`.

## Example API requests

### Health check

```powershell
curl http://127.0.0.1:8000/health
```

### Index a transcript

```powershell
curl -X POST http://127.0.0.1:8000/index-video ^
  -H "Content-Type: application/json" ^
  -d "{\"videoId\":\"abc123\",\"title\":\"Demo Video\",\"transcript\":[{\"timestamp\":\"0:00\",\"text\":\"Hello world\"}]}"
```

### Ask a question

```powershell
curl -X POST http://127.0.0.1:8000/rag/invoke ^
  -H "Content-Type: application/json" ^
  -d "{\"input\":{\"video_id\":\"abc123\",\"question\":\"What is mentioned?\"}}"
```

## Notes

- Vector stores are kept only in memory.
- A video must be indexed once before questions can be asked.
- Transcript extraction is handled by the Chrome extension.
- LangSmith tracing works automatically when the LangSmith environment variables are set before starting the backend.

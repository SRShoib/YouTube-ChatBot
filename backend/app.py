import os
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langserve import add_routes
from pydantic import BaseModel, Field

from rag_chain import rag_runnable
from rate_limit import rate_limit_indexing, rate_limit_questions
from store import get_vector_store, save_vector_store

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

app = FastAPI(title="YouTube RAG Chatbot")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscriptSegment(BaseModel):
    timestamp: str = Field(..., description="Transcript timestamp")
    text: str = Field(..., description="Transcript text")


class IndexVideoRequest(BaseModel):
    videoId: str
    title: str
    transcript: List[TranscriptSegment]


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/video-status/{video_id}")
def video_status(video_id: str) -> dict:
    return {"indexed": get_vector_store(video_id) is not None}


@app.post("/index-video", dependencies=[Depends(rate_limit_indexing)])
def index_video(payload: IndexVideoRequest) -> dict:
    if not payload.videoId.strip():
        raise HTTPException(status_code=400, detail="videoId is required.")

    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="title is required.")

    if not payload.transcript:
        raise HTTPException(status_code=400, detail="Transcript is empty.")

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not set.")

    combined_text = "\n".join(
        f"[{segment.timestamp}] {segment.text.strip()}"
        for segment in payload.transcript
        if segment.text.strip()
    ).strip()

    if not combined_text:
        raise HTTPException(status_code=400, detail="Transcript has no usable text.")

    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    chunks = splitter.split_text(combined_text)

    documents = [
        Document(
            page_content=chunk,
            metadata={"video_id": payload.videoId, "title": payload.title, "chunk": index},
        )
        for index, chunk in enumerate(chunks)
    ]

    embeddings = OpenAIEmbeddings(
        model="text-embedding-3-small"
    )
    vector_store = FAISS.from_documents(documents, embeddings)
    save_vector_store(payload.videoId, vector_store)

    return {
        "ok": True,
        "videoId": payload.videoId,
        "title": payload.title,
        "chunks": len(documents),
    }


add_routes(app, rag_runnable, path="/rag", dependencies=[Depends(rate_limit_questions)])

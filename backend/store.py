from typing import Dict, Optional

from langchain_community.vectorstores import FAISS


# Simple in-memory storage keyed by YouTube video ID.
_VIDEO_STORES: Dict[str, FAISS] = {}


def save_vector_store(video_id: str, vector_store: FAISS) -> None:
    _VIDEO_STORES[video_id] = vector_store


def get_vector_store(video_id: str) -> Optional[FAISS]:
    return _VIDEO_STORES.get(video_id)


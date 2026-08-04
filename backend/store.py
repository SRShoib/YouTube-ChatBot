from collections import OrderedDict
from typing import Optional

from langchain_community.vectorstores import FAISS

# In-memory storage keyed by YouTube video ID. Capped so a long-running
# process can't grow without bound; oldest-used video is dropped first.
_MAX_VIDEOS = 50
_VIDEO_STORES: "OrderedDict[str, FAISS]" = OrderedDict()


def save_vector_store(video_id: str, vector_store: FAISS) -> None:
    _VIDEO_STORES[video_id] = vector_store
    _VIDEO_STORES.move_to_end(video_id)
    while len(_VIDEO_STORES) > _MAX_VIDEOS:
        _VIDEO_STORES.popitem(last=False)


def get_vector_store(video_id: str) -> Optional[FAISS]:
    vector_store = _VIDEO_STORES.get(video_id)
    if vector_store is not None:
        _VIDEO_STORES.move_to_end(video_id)
    return vector_store

from pydantic import BaseModel, Field

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from langchain_openai import ChatOpenAI

from store import get_vector_store


class RagInput(BaseModel):
    video_id: str = Field(..., description="YouTube video ID")
    question: str = Field(..., description="User question about the video")


SUMMARY_KEYWORDS = [
    "summary",
    "summarize",
    "summery",
    "main points",
    "overview",
    "recap",
]


def _is_summary_question(question: str) -> bool:
    normalized_question = question.lower()
    return any(keyword in normalized_question for keyword in SUMMARY_KEYWORDS)


def _build_summary_context(video_id: str) -> str:
    vector_store = get_vector_store(video_id)
    if vector_store is None:
        return ""

    stored_docs = getattr(vector_store.docstore, "_dict", {})
    docs = list(stored_docs.values())
    if not docs:
        return ""

    docs.sort(key=lambda doc: doc.metadata.get("chunk", 0))
    return "\n\n".join(doc.page_content for doc in docs)


def _build_context(question: str, video_id: str) -> str:
    if _is_summary_question(question):
        return _build_summary_context(video_id)

    vector_store = get_vector_store(video_id)
    if vector_store is None:
        return ""

    retriever = vector_store.as_retriever(search_kwargs={"k": 4})
    docs = retriever.invoke(question)
    if not docs:
        return ""

    return "\n\n".join(doc.page_content for doc in docs)


def _answer_question(data: RagInput) -> dict:
    question = data.question.strip()
    if not question:
        return {"answer": "Please enter a question."}

    context = _build_context(question=question, video_id=data.video_id)
    if not context:
        return {"answer": "I couldn't find that in the transcript."}

    if _is_summary_question(question):
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    (
                        "You answer only from the provided YouTube transcript context. "
                        "For summary requests, write a short, clear summary using only the transcript. "
                        "If the transcript context is missing or insufficient, return exactly: "
                        "\"I couldn't find that in the transcript.\""
                    ),
                ),
                (
                    "human",
                    "Transcript context:\n{context}\n\nQuestion: {question}",
                ),
            ]
        )
    else:
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    (
                        "You answer questions only from the provided YouTube transcript context. "
                        "If the answer is not clearly in the context, return exactly: "
                        "\"I couldn't find that in the transcript.\""
                    ),
                ),
                (
                    "human",
                    "Transcript context:\n{context}\n\nQuestion: {question}",
                ),
            ]
        )

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    chain = prompt | llm | StrOutputParser()
    answer = chain.invoke({"context": context, "question": question}).strip()

    if not answer:
        answer = "I couldn't find that in the transcript."

    return {"answer": answer}


rag_runnable = RunnableLambda(lambda data: _answer_question(RagInput(**data))).with_types(
    input_type=RagInput
)

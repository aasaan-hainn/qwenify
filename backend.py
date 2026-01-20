import time
import json
import os
import feedparser
import chromadb
from openai import OpenAI
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
# Your NVIDIA Key
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
BASE_URL = os.getenv("NVIDIA_BASE_URL")
MODEL_NAME = os.getenv("MODEL_NAME")
DB_PATH = os.getenv("DB_PATH", "./my_local_db")
RSS_URL = os.getenv("RSS_URL")
PORT = int(os.getenv("PORT", 5000))

# --- SERVER SETUP ---
app = Flask(__name__)
CORS(app)  # Allows React to talk to Python

# Initialize Clients Globaly
print("Initializing Clients...")
nvidia_client = OpenAI(base_url=BASE_URL, api_key=NVIDIA_API_KEY)
chroma_client = chromadb.PersistentClient(path=DB_PATH)
# Using default embedding function (all-MiniLM-L6-v2 via ONNX)
collection = chroma_client.get_or_create_collection(name="news_storage")


# --- HELPER FUNCTIONS ---
def fetch_and_store_news():
    print("Scraping Google News...")
    feed = feedparser.parse(RSS_URL)
    news_data = []

    # Get top 5
    for entry in feed.entries[:5]:
        text = f"Title: {entry.title}. Summary: {entry.summary}"
        # Store - Chroma handles embedding automatically now
        unique_id = f"news_{int(time.time())}_{feed.entries.index(entry)}"
        collection.upsert(ids=[unique_id], documents=[text])
        news_data.append(entry.title)

    return news_data


# --- API ROUTES ---


@app.route("/update-news", methods=["POST"])
def update_news():
    """Trigger this button from frontend to refresh news"""
    titles = fetch_and_store_news()
    return {"status": "success", "articles": titles}


@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_query = data.get("message", "")
    history = data.get("history", [])

    def generate():
        # 1. RAG Search - Chroma handles query embedding automatically
        results = collection.query(query_texts=[user_query], n_results=3)

        context = "No context available."
        if results["documents"][0]:
            context = "\n".join(results["documents"][0])

        # 2. Prepare System Prompt with Instructions
        system_instruction = f"""
        You are a helpful assistant for daily life.

        INSTRUCTIONS:
        1. Check the provided CONTEXT below.
        2. If the CONTEXT contains information relevant to the user's QUESTION, use it to answer.
        3. If the CONTEXT is empty or irrelevant to the QUESTION, ignore it and answer using your own knowledge.
        
        CONTEXT:
        {context}
        """

        # 3. Construct Message Chain
        # Start with System Prompt
        messages_payload = [{"role": "system", "content": system_instruction}]
        
        # Add History
        for msg in history:
            role = "assistant" if msg["role"] == "ai" else "user"
            messages_payload.append({"role": role, "content": msg["content"]})

        # Add Latest User Question
        messages_payload.append({"role": "user", "content": f"QUESTION:\n{user_query}"})

        # 4. Call NVIDIA (Stream)
        completion = nvidia_client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages_payload,
            temperature=0.6,
            top_p=0.7,
            max_tokens=4096,
            stream=True,
        )

        # 5. Stream Response to React
        for chunk in completion:
            # Handle Thinking
            reasoning = getattr(chunk.choices[0].delta, "reasoning_content", None)
            if reasoning:
                # Send a JSON chunk labeled 'thought'
                yield f"data: {json.dumps({'type': 'thought', 'content': reasoning})}\n\n"

            # Handle Answer
            content = chunk.choices[0].delta.content
            if content:
                # Send a JSON chunk labeled 'answer'
                yield f"data: {json.dumps({'type': 'answer', 'content': content})}\n\n"

        # End stream
        yield "data: [DONE]\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream")


if __name__ == "__main__":
    # Run the server on the configured Port
    app.run(host="0.0.0.0", port=PORT, debug=False)

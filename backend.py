import time
import json
import os
import feedparser
import chromadb
import requests
from pypdf import PdfReader
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
NEWS_API_KEY = os.getenv("NEWS_API_KEY")
UPLOADS_DIR = "uploads"

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


def fetch_newsapi_data():
    print("Fetching data from NewsAPI...")
    all_articles = []

    # 1. Get Local News (West Bengal) using /everything endpoint
    # We use "q" to search specifically for your region
    local_url = f"https://newsapi.org/v2/everything?q=West+Bengal+scheme&sortBy=publishedAt&apiKey={NEWS_API_KEY}"
    try:
        local_resp = requests.get(local_url).json()
        if local_resp.get("status") == "ok":
            for article in local_resp["articles"][:3]:  # Get top 3 local
                all_articles.append(
                    {
                        "title": article["title"],
                        "description": article["description"],
                        "content": article["content"],
                        "source": "Local News (West Bengal)",
                    }
                )
    except Exception as e:
        print(f"Error fetching local news: {e}")

    # 2. Get National News (India) using /top-headlines endpoint
    national_url = f"https://newsapi.org/v2/top-headlines?country=in&category=general&apiKey={NEWS_API_KEY}"
    try:
        nat_resp = requests.get(national_url).json()
        if nat_resp.get("status") == "ok":
            for article in nat_resp["articles"][:3]:  # Get top 3 national
                all_articles.append(
                    {
                        "title": article["title"],
                        "description": article["description"],
                        "content": article["content"],
                        "source": "National News (India)",
                    }
                )
    except Exception as e:
        print(f"Error fetching national news: {e}")

    # 3. Store in ChromaDB
    titles = []
    for idx, article in enumerate(all_articles):
        # Create a rich text block for the AI to read
        full_text = f"""
        SOURCE: {article["source"]}
        TITLE: {article["title"]}
        SUMMARY: {article["description"]}
        CONTENT: {article["content"]}
        """

        unique_id = f"newsapi_{int(time.time())}_{idx}"

        collection.upsert(
            ids=[unique_id],
            documents=[full_text],
            metadatas=[{"type": "news", "title": article["title"]}],
        )
        titles.append(article["title"])

    return titles


def ingest_local_pdfs():
    print(f"Scanning '{UPLOADS_DIR}' for PDFs...")
    processed_files = []
    
    if not os.path.exists(UPLOADS_DIR):
        os.makedirs(UPLOADS_DIR)
        return []

    for root, dirs, files in os.walk(UPLOADS_DIR):
        for file in files:
            if file.lower().endswith(".pdf"):
                file_path = os.path.join(root, file)
                try:
                    reader = PdfReader(file_path)
                    print(f"Processing: {file}")
                    
                    for i, page in enumerate(reader.pages):
                        text = page.extract_text()
                        if text:
                            # Contextual ID: filename_page
                            # Use relative path for clarity (e.g., news/report.pdf)
                            rel_path = os.path.relpath(file_path, UPLOADS_DIR)
                            unique_id = f"pdf_{rel_path}_p{i}"
                            
                            document_text = f"""
                            SOURCE: PDF Document ({rel_path}, Page {i+1})
                            CONTENT: {text}
                            """
                            
                            collection.upsert(
                                ids=[unique_id],
                                documents=[document_text],
                                metadatas=[{"type": "pdf", "source": rel_path, "page": i+1}]
                            )
                    processed_files.append(file)
                except Exception as e:
                    print(f"Error processing {file}: {e}")
                    
    return processed_files


# --- API ROUTES ---


@app.route("/update-news", methods=["POST"])
def update_news():
    """Trigger this button from frontend to refresh news"""
    rss_titles = fetch_and_store_news()
    newsapi_titles = fetch_newsapi_data()
    pdf_files = ingest_local_pdfs()
    
    # Combine results for frontend display
    summary = rss_titles + newsapi_titles + [f"PDF: {f}" for f in pdf_files]
    return {"status": "success", "articles": summary}


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

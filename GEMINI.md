# Hello Chat - Project Context

## Project Overview
**Hello Chat** is a full-stack RAG (Retrieval-Augmented Generation) application that integrates a local news database with an LLM to provide an intelligent news assistant.

It allows users to:
1.  **Fetch & Store News**: Scrape Google News RSS and store embeddings in a local ChromaDB.
2.  **Chat with AI**: Query the news database using natural language. The backend uses the NVIDIA API (Qwen 3 model) and Ollama for embeddings to answer questions based on the stored news context.
3.  **View Reasoning**: The frontend displays the "Thought Process" (reasoning) of the LLM separately from the final answer.

## Tech Stack

### Backend
*   **Language**: Python
*   **Framework**: Flask
*   **Database**: ChromaDB (Vector Store)
*   **AI/LLM**:
    *   **LLM Provider**: NVIDIA API (`qwen/qwen3-next-80b-a3b-thinking`)
    *   **Embeddings**: Ollama (`nomic-embed-text`)
*   **Libraries**: `feedparser` (RSS), `flask_cors` (CORS), `openai` (NVIDIA client)

### Frontend
*   **Framework**: React 19 + Vite
*   **Styling**: Tailwind CSS
*   **Icons**: Lucide React
*   **Markdown Rendering**: `react-markdown`
*   **Communication**: HTTP + Server-Sent Events (SSE) for streaming responses.

## Setup & Installation

### Prerequisites
*   Node.js & npm
*   Python 3.8+
*   Ollama running locally with `nomic-embed-text` model pulled.
*   NVIDIA API Key (currently hardcoded in `backend.py`, should be moved to env vars).

### 1. Backend Setup
1.  Navigate to the root directory.
2.  Install dependencies (create a `requirements.txt` if needed, currently inferred):
    ```bash
    pip install flask flask-cors feedparser chromadb ollama openai
    ```
3.  Ensure Ollama is running and the embedding model is available:
    ```bash
    ollama pull nomic-embed-text
    ```

### 2. Frontend Setup
1.  Navigate to the `frontend` directory:
    ```bash
    cd frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Running the Application

### 1. Start the Backend
From the root directory:
```bash
python backend.py
```
*   Runs on: `http://localhost:5000`
*   API Endpoints:
    *   `POST /update-news`: Triggers RSS scrape and vector store update.
    *   `POST /chat`: Handles chat queries with streaming response.

### 2. Start the Frontend
From the `frontend` directory:
```bash
npm run dev
```
*   Runs on: `http://localhost:5173` (typically)
*   The frontend is configured to proxy requests or directly call `http://localhost:5000`.

## Project Structure

```
/
├── backend.py            # Main Flask application & RAG logic
├── my_local_db/          # Persistent ChromaDB storage
├── frontend/             # React application
│   ├── vite.config.js    # Vite configuration
│   ├── package.json      # Frontend dependencies
│   └── src/
│       ├── App.jsx       # Main UI component (Chat interface)
│       ├── main.jsx      # Entry point
│       └── ...
└── GEMINI.md             # This context file
```

## Development Conventions
*   **Streaming**: The backend streams responses using SSE. The frontend parses `data: ` chunks to separate "thought" (reasoning) from "answer".
*   **CORS**: `flask_cors` is used to allow the React app to communicate with the Flask API.
*   **State Management**: React `useState` is used for managing chat history (`messages`), input, and loading states.
*   **Vector DB**: `chromadb` stores news articles with a generated ID based on time and index.

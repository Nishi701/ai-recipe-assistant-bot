# ChefAI - AI Recipe Assistant Bot

ChefAI is an AI-powered cooking chatbot built with React (Vite) and Express, powered by Google Gemini.
Tell it what ingredients you have or what you feel like eating, and it instantly gives you
3 different recipes: a classic, a quick one, and a creative twist.


## Features

- 3 recipes per request: classic, quick and creative versions, each using different ingredients or methods
- Live streaming replies: answers appear word by word instead of after a long wait
- Stop button: cancel a response mid-way and keep the partial answer
- Diet filters: Vegetarian, Vegan, Gluten-free, Dairy-free, Nut-free, Egg-free, High-protein, Low-carb, Halal
- Save recipes: one-tap "Save recipe" button and a Cookbook view (stored in browser localStorage)
- Saved chat history: the conversation is still there after a page refresh
- Responsive design: works on phone, tablet and desktop, with automatic dark mode
- Cooking-only focus: politely declines off-topic questions
- Reliable backend: automatic retries and fallback Gemini models when the server is busy


## Tech Stack

Frontend : React, Vite, react-markdown, plain CSS (App.css)
Backend  : Node.js, Express, CORS, dotenv
AI       : Google Gemini API (@google/genai)


## Project Structure

gemini-chat/
  frontend/
    src/
      App.jsx      (entire chat UI in one file)
      App.css      (all styles)
      main.jsx
  backend/
    server.js      (entire backend in one file)
    .env           (your API key, NOT committed)
    .env.example   (template for .env)
    package.json
  README.txt


## Prerequisites

- Node.js 20.19+ or 22.12+
- npm
- A free Gemini API key from https://aistudio.google.com/apikey


## Setup and Run

1. Clone the repository

   git clone https://github.com/YOUR_USERNAME/ai-recipe-assistant-bot.git
   cd ai-recipe-assistant-bot

2. Backend

   cd backend
   npm install

   Create a file named .env inside the backend folder:

   Gemini_API_Key=your_gemini_api_key_here
   PORT=5000

   Start the server:

   npm run dev

3. Frontend (open a second terminal)

   cd frontend
   npm install
   npm run dev

4. Open http://localhost:5173 in your browser.


## How It Works

1. The React app sends the chat history and selected diet filters to POST /api/chat.
2. The Express server adds a system prompt (ChefAI persona, 3-recipe format, diet rules)
   and calls Gemini with streaming enabled.
3. If a model is busy (503/429), the server retries and then falls back to another model.
4. The reply is streamed back to the browser and rendered as Markdown.
5. Each recipe gets its own Save button. Saved recipes, chat history and diet filters are
   kept in the browser's localStorage.


## Environment Variables

Gemini_API_Key   Your Google Gemini API key (required)
PORT             Backend port (default 5000)

Never commit your .env file or share your API key. If a key is exposed, delete it in
Google AI Studio and create a new one.


## Troubleshooting

- "Missing Gemini_API_Key": the .env file must be inside the backend folder with the exact variable name.
- 404 model not found: change the model names in the MODELS list in backend/server.js.
- 503 high demand: temporary Google overload; the app retries automatically, or try again in a minute.
- CORS error: the frontend must run on http://localhost:5173.


## Roadmap

- Dark/light mode toggle
- Serving-size scaler and nutrition estimates
- Shopping list generator
- Photo upload of fridge contents
- User accounts and cloud-synced cookbook
- Deployment (Vercel/Netlify for frontend, Render/Railway for backend)


## Disclaimer

Recipes are AI-generated and meant for ideas and guidance. If you have severe allergies or
medical dietary needs, always verify ingredients yourself.


## License

MIT (or choose your own)

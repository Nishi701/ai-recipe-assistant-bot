# ChefAI - AI Recipe Assistant Bot

ChefAI is an AI-powered cooking chatbot built with React (Vite) and Express, powered by Google Gemini.
Tell it what ingredients you have, snap a photo of your fridge, or just tap a few options, and it
instantly gives you 3 different recipes: a classic, a quick one, and a creative twist.


## Features

### Chat and recipes
- 3 recipes per request: classic, quick and creative versions, each using different ingredients or methods
- Live streaming replies: answers appear word by word instead of after a long wait
- Stop button: cancel a response mid-way and keep the partial answer
- Diet filters: Vegetarian, Vegan, Gluten-free, Dairy-free, Nut-free, Egg-free, High-protein, Low-carb, Halal
- Cooking-only focus: politely declines off-topic questions

### Easy to use (no typing needed)
- Quick Builder: tap Meal, Cuisine, Time and "I have" ingredients, then press "Get 3 recipes"
- Photo upload: upload a picture of your fridge or ingredients; the AI lists what it sees and suggests recipes
  (photos are resized in the browser before upload to keep requests small)
- Suggestion chips on the welcome screen for one-tap ideas

### Tools under every recipe
- Save: store the recipe in your Cookbook
- Nutrition: approximate calories, protein, carbs, fat and fibre per serving
- Shopping list: ingredients grouped by aisle, with pantry staples listed separately
- Serving scaler: rescale the recipe for 1, 2, 4, 6, 8 or 10 people with quantities recalculated

### Cookbook
- Saved recipes view with Copy and Remove buttons
- "Shopping list for all saved": one combined list that merges duplicate ingredients
- Stored in browser localStorage and kept when you press "New chat"

### Creativity control (temperature)
- Slider from 0.1 to 0.9 (default 0.7), sent to the backend and applied to Gemini
- 0.1 - 0.3 Precise: consistent answers, best for quantities, nutrition and shopping lists
- 0.4 - 0.6 Balanced
- 0.7 - 0.9 Creative: more varied and surprising recipes
- The server clamps the value to 0.1 - 0.9, so no other value can get through

### Look and feel
- Dark / light mode toggle, remembered between visits (first visit follows your system setting)
- Responsive design: full screen on phones, centered card on desktop, growing text box
- Saved chat history: the conversation is still there after a page refresh

### Reliability
- Automatic retries and fallback Gemini models when a model is busy (503/429) or unavailable (404)


## Tech Stack

Frontend : React, Vite, react-markdown, plain CSS (App.css)
Backend  : Node.js, Express, CORS, dotenv
AI       : Google Gemini API (@google/genai), text + image input, streaming


## Project Structure

gemini-chat/
  frontend/
    src/
      App.jsx      (entire chat UI in one file)
      App.css      (all styles, light and dark themes)
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

   git clone https://github.com/Nishi701/ai-recipe-assistant-bot.git
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
   npm install react-markdown
   npm run dev

4. Open http://localhost:5173 in your browser.


## How It Works

1. The React app sends the chat history, selected diet filters, the temperature value and
   an optional photo (base64 JPEG) to POST /api/chat.
2. The Express server builds a system prompt (ChefAI persona, 3-recipe format, diet rules,
   and rules for scaling, nutrition, shopping lists and photos).
3. It clamps the temperature to 0.1 - 0.9, attaches the photo to the latest message,
   and calls Gemini with streaming enabled.
4. If a model is busy (503/429), the server retries and then falls back to another model.
5. The reply is streamed back to the browser and rendered as Markdown.
6. The UI splits the answer into recipe cards. Each card has Save, Nutrition, Shopping list
   and Scale buttons, which send a short follow-up request automatically.
7. Saved recipes, chat history, diet filters, theme and temperature are kept in the
   browser's localStorage (photo previews are not stored).


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
- "Couldn't read that image": use a JPG or PNG photo (some HEIC phone photos are not supported by browsers).
- Photo request fails: the image may be too large; try a smaller photo (the backend accepts up to 8 MB per request).
- Styles or theme look stale: hard-refresh with Ctrl+Shift+R.


## Roadmap

Done:
- Dark/light mode toggle
- Serving-size scaler and nutrition estimates
- Shopping list generator
- Photo upload of fridge contents
- Quick Builder and temperature control

Planned:
- Print / save recipe as PDF
- Search inside the Cookbook
- Voice input and read-aloud steps
- User accounts and cloud-synced cookbook
- Rate limiting on the backend
- Deployment (Vercel/Netlify for frontend, Render/Railway for backend)


## Disclaimer

Recipes and nutrition values are AI-generated estimates meant for ideas and guidance. If you have
severe allergies or medical dietary needs, always verify ingredients yourself.


## License

MIT (or choose your own)

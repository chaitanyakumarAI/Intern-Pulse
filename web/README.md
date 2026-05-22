# Intern Pulse (Web Dashboard) 🌌

A premium, glassmorphic Next.js web application designed to visualize and manage your job and internship application pipeline. Powered by Google Gemini and Notion integrations, it provides automated tracking, scam detection, and prep sheets.

---

## ✨ Features

- **📊 Real-time Metrics**: Track active applications, scheduled interviews, and successful offers with response rate calculations.
- **🎨 Glassmorphic Interface**: High-fidelity brutalist design featuring smooth hover states, dynamic animations via Framer Motion, and a 3D particle sphere.
- **🔬 Job Safety Scanner**: Flag high-risk job opportunities using community reports and AI safety reviews.
- **⚡ AI Prep Sheets**: View tailored study resources and anticipated interview questions directly inside the job card details.
- **🚀 Kanban Board & Hub**: Organize applications across pipeline stages (Kanban) and access central AI insights in dedicated views.
- **🔌 Zero-Config Demo Mode**: Automatically falls back to high-fidelity mock data if Notion environment variables are not set.

---

## 🛠️ Tech Stack

- **Framework**: Next.js (App Router, Turbopack)
- **Runtime**: React 19 / TypeScript
- **Styling**: TailwindCSS & Custom CSS Globals
- **Animations**: Framer Motion
- **Graphics**: Three.js & React Three Fiber (for interactive 3D particle sphere)
- **Charts**: Recharts & Lucide Icons

---

## 🚀 Getting Started

### 1. Installation
Clone the repository and install the dependencies:
```bash
cd web
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the `web/` directory and populate your Notion API details:
```env
NOTION_API_KEY=your_notion_api_key
NOTION_DATABASE_ID=your_notion_database_id
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Build for Production
To test the optimized production build locally:
```bash
npm run build
npm run start
```

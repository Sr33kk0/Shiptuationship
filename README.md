# File Structure 

document-verification-saas/
├── frontend/                 # React + Vite (SaaS Dashboard)
│   ├── public/
│   ├── src/
│   │   ├── assets/           # Modern UI/UX assets, sleek icons
│   │   ├── components/       # Reusable UI (DocumentViewer, StatusBadge)
│   │   ├── pages/            # Dashboard, HumanReviewQueue, EmailDetail
│   │   ├── services/         # API calls to FastAPI
│   │   ├── store/            # State management (Zustand/Redux)
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # FastAPI + Python Logic
│   ├── app/
│   │   ├── api/              # Endpoints (e.g., /submit, /compare, /review)
│   │   ├── core/             # Configuration, Supabase client init
│   │   ├── models/           # Pydantic schemas (SI/BL data validation)
│   │   ├── services/         # Comparison logic, PDF/OCR processing scripts
│   │   └── main.py           # FastAPI application entry point
│   ├── tests/                # Unit tests for the deterministic comparison
│   └── requirements.txt
│
├── n8n/                      # Workflow Assets
│   └── workflows/            # Exported .json n8n workflows
│
├── .gitignore
├── docker-compose.yml        # (Optional) Spin up frontend, backend, and n8n locally
└── README.md
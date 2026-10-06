# MIHAK — مِحَكّ

MIHAK is an AI-powered Islamic content integrity checker designed for source-grounded claim verification.

## Overview

MIHAK analyzes Islamic-content claims, retrieves relevant evidence from connected sources, evaluates the relationship between the claim and the evidence, and presents a traceable result.

The system is designed to support verification, not to replace qualified scholars or issue new religious rulings.

## Main Features

- Claim-level verification
- Compound claim decomposition
- Quran evidence retrieval
- Tafsir retrieval
- Hadith data retrieval
- Semantic retrieval and reranking
- Evidence-grounded evaluation
- Abstention when evidence is insufficient
- Traceable source display

## Technology Stack

### Frontend
- React
- TypeScript

### Backend
- TypeScript
- Node.js
- Central Orchestrator

### AI
- Google Gemini API
- Groq API as a fallback for selected AI operations

### Retrieval
- Retrieval-Augmented Generation (RAG)
- Semantic Retrieval
- Deterministic Reranking
- Evidence-bound evaluation

## Knowledge Sources

The current project includes:

- 114 Quran surahs
- 6236 Quran verses
- 6236 Tafsir records
- 6236 Gharib al-Quran records
- 6236 Quran parsing/I'rab records
- 3582 Hadith records

## Environment Variables

Create a local `.env` file based on `.env.example`.

Example:

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
APP_URL=your_app_url_here
```

Do not commit real API keys or secrets to the repository.

## Installation

Install dependencies:

```bash
npm install
```

Run the project:

```bash
npm run dev
```

## Live Demo

A working live demo is provided separately as part of the challenge submission.

## Safety Principles

MIHAK does not treat the language model as the source of religious truth.

It uses AI to understand the user's input, route retrieval, and analyze evidence relationships, while the connected evidence sources remain the basis of the final result.

When evidence is insufficient, the system is designed to abstain or recommend specialist review rather than fabricate an answer.

## Challenge

AI Challenge — Serving Islamic Content

Track 04: Knowledge and Verification Tools for Empowering Those Introducing Islam

## Team

MIHAK Integrity Team

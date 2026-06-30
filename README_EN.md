# Kids Points Bank · 积分银行

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Docker Image](https://img.shields.io/badge/ghcr.io-robs87/kids--points--bank-blue?logo=docker)](https://github.com/Robs87/kids-points-bank/pkgs/container/kids-points-bank)
[![Unraid](https://img.shields.io/badge/Unraid-✅-4153A0?logo=linux)](#-quick-start)
[![GitHub Stars](https://img.shields.io/github/stars/Robs87/kids-points-bank?style=social)](https://github.com/Robs87/kids-points-bank/stargazers)

中文 | [English](README_EN.md)

> Transform invisible self-discipline into visible assets using a token economy to catalyze children's intrinsic motivation.

## 📖 About

Kids Points Bank is a pure frontend children's growth incentive tool based on **Token Economy** theory from educational psychology. It transforms abstract goals like "be good" or "study hard" into tangible, trackable point-based rewards.

Inspired by [Jessica's Summer Growth Points Bank](https://mp.weixin.qq.com/s/rgny628l633XrJeZokrcZg), this project implements a complete, production-ready system with Docker deployment support.

## 🧠 Design Philosophy

| Problem | Solution | Psychology |
|---------|----------|------------|
| Abstract, long-term goals lack motivation | Every action earns instant points | Dopamine-driven feedback loop |
| Big goals overwhelm children | Break down into daily visible tasks | Goal gradient effect |
| Check-in habits fade quickly | Streak bonuses + weekly family review | Reflective learning |
| Material rewards undermine intrinsic motivation | Experience-based rewards (movies, trips, menu choice) | Intrinsic motivation preservation |

## ✨ Five Modules

### 1. 🗺️ Growth Map

Five dimensions visualized as progress rings. Click to expand task details.

### 2. ✅ Daily Check-in

- Task list organized by dimension
- Tap to earn points with floating animation + haptic feedback
- Streak milestone bonuses (3/7/14/30 days)
- Daily check-in cap to prevent burnout

### 3. 🎁 Reward Redemption

Three-tier reward system:

| Tier | Cost | Examples |
|------|------|----------|
| ⭐ Small | 10 pts | Family movie night, bedtime story |
| 🌟 Medium | 30 pts | Buy a book, parent-child outing |
| 💫 Large | 60 pts | Short trip, fulfill a wish |

Parents customize reward content and approve redemptions.

### 4. 📊 Weekly Review

Weekend family meeting template:
- Child writes "best thing" and "hardest thing"
- Parent writes "observed progress"
- Child requests "needed support"
- Auto-statistics: tasks completed, points earned, dimensions lit

### 5. 📸 Growth Portfolio

- Photo/video upload for growth moments
- Dimension tagging
- Automatic image compression (IndexedDB)
- End-of-period growth archive generation

## 📐 Architecture

```
┌─────────────────────────────────────────────┐
│                   Browser                   │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Map View │  │ Checkin  │  │ Rewards  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │             │          │
│  ┌────┴──────────────┴─────────────┴─────┐   │
│  │          App Core (app.js)             │   │
│  │  Tab Router │ State │ Animations       │   │
│  └──────────────────┬─────────────────────┘   │
│                     │                          │
│  ┌──────────────────┴─────────────────────┐   │
│  │         Storage Layer                  │   │
│  │  ┌──────────────┐  ┌───────────────┐   │   │
│  │  │ localStorage │  │  IndexedDB    │   │   │
│  │  │ (JSON)       │  │ (Images)      │   │   │
│  │  └──────────────┘  └───────────────┘   │   │
│  └────────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

## 📁 Project Structure

```
kids-points-bank/
├── index.html          # Main page, 5 modules + bottom nav
├── css/
│   └── style.css       # Styles (mobile-first, fresh green theme)
├── js/
│   ├── data.js         # Data model (dimensions/tasks/rewards/settings)
│   ├── storage.js      # Storage layer (localStorage + IndexedDB)
│   └── app.js          # Core logic (5 modules + router + animations)
├── Dockerfile          # Docker image build file
├── kids-points-bank.xml # Unraid template
├── .github/            # GitHub templates (Issues/PRs)
├── CONTRIBUTING.md     # Contributing guide
├── SECURITY.md         # Security policy
├── CHANGELOG.md        # Changelog
└── README.md           # This file
```

## 🚀 Quick Start

### Option 1: Local (Simplest)

1. Clone or download this project
2. Open `index.html` in your browser
3. Done — no server needed

### Option 2: Docker

```bash
docker run -d \
  --name kids-points-bank \
  --restart unless-stopped \
  -p 8899:80 \
  ghcr.io/robs87/kids-points-bank:latest
```

Visit `http://localhost:8899/`

### Option 3: Unraid

Add the container via Unraid Docker tab using template `kids-points-bank.xml`, or search for `ghcr.io/robs87/kids-points-bank` in the WebUI.

## 🛡️ Security & Privacy

- **Pure frontend**: All data stored locally (localStorage + IndexedDB)
- **Zero network requests**: No server, no registration, works offline
- **Parental gate**: Reward redemption and point adjustments require parent approval
- **Data export**: One-click JSON backup, restore anytime
- **XSS protection**: All user input is HTML-escaped

## ⚙️ Customization

All configuration lives in `js/data.js`:

- **Modify tasks**: Edit `dimensions[].tasks` array
- **Modify rewards**: Edit `rewards[].items` array
- **Change points**: Adjust `tasks[].points` values
- **Set PIN code**: Set a 4-6 digit number in `settings.parentPin`

## 🐛 Known Limitations

- Data stored in browser locally — switching devices requires manual export/import
- Image compression quality fixed at 70% JPEG
- No multi-child/multi-account support
- Parent settings panel not yet implemented (manual code editing required)

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

> "Points are not about controlling children, but helping them see: my efforts have value."

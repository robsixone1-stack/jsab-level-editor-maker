# JSAB Level Kit

A lightweight **Just Shapes & Beats–inspired** game template built with **vanilla JavaScript + HTML Canvas**.

This kit lets anyone create and play custom levels by editing a simple **JSON timeline file** — no engine, no build step, no dependencies.

> This is a community-made project inspired by rhythm-dodge gameplay.  
> It is **not affiliated with or endorsed by the creators of Just Shapes & Beats**.

---

## ✨ Features

- Smooth player movement + dash (JSAB-style)
- Dash invincibility window
- Timeline-based level system (JSON)
- Normalized coordinates (levels scale to any screen size)
- Built-in hazards:
  - Beats
  - Lasers (with warning phase)
  - Bombs (explode into bullets + screen flash)
  - Closing walls
- Load levels instantly without reloading the page

---

## 📁 Project Structure
jsab-level-kit/
├─ index.html
├─ style.css
├─ game.js
├─ levels/
│ └─ example-level.json
└─ README.md


---

## ▶️ How to Play (IMPORTANT)

This project **must be run from a local server**.  
Opening `index.html` directly (double-clicking it) will **not work**.

Browsers block loading JSON files (`fetch`) when running from `file://`.

### Option 1: VS Code (recommended)

1. Install **Visual Studio Code**
2. Open the `jsab-level-kit` folder
3. Install the **Live Server** extension
4. Right-click `index.html`
5. Click **“Open with Live Server”**

##How to create beats

🟣 Beat

A stationary hazard.

{
  "t": 1.0,
  "type": "beat",
  "x": 0.5,
  "y": 0.5,
  "r": 18
}


🔥 Laser

A sweeping laser with a warning phase.

{
  "t": 2.0,
  "type": "laser",
  "dir": "right",
  "warn": 0.7,
  "thickness": 18,
  "speed": 900,
  "length": 1600
}



💣 Bomb

Explodes after a fuse and shoots bullets outward.

{
  "t": 4.0,
  "type": "bomb",
  "x": 0.5,
  "y": 0.3,
  "fuse": 0.85,
  "bullets": 18,
  "bulletSpeed": 380,
  "flash": true
}



🧱 Wall

A wall that closes in from one side of the arena.

{
  "t": 6.0,
  "type": "wall",
  "side": "left",
  "warn": 0.65,
  "width": 220,
  "speed": 260




  side options:

"left"

"right"

"up"

"down"

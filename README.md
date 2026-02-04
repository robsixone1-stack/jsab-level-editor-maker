# JSAB Level Kit (Community Template)

A tiny JS + Canvas kit inspired by Just Shapes & Beats style gameplay:
- Move with WASD / Arrow keys
- Dash with Space (optional invincibility during dash)
- Level is a JSON timeline: spawn beats / lasers / bombs / walls at time `t`

## Run locally
Use any static server:
- VS Code Live Server extension
- or `python -m http.server`

Then open `http://localhost:PORT`

## Make your own level
Edit `levels/example-level.json` or upload a `.json` file in the UI.

### Coordinate system
`x` and `y` are normalized:
- `0` = left/top
- `1` = right/bottom

### Events
All events include:
- `t` = seconds from level start
- `type` = "beat" | "laser" | "bomb" | "wall"

#### beat
```json
{ "t": 1.0, "type": "beat", "x": 0.5, "y": 0.5, "r": 18 }

# VRT (Visual Regression Testing) + AI Research Notes

## Motivation

Investigate an architecture that uses AI to reason about diffs detected by VRT and perform self-healing.
Since this is expensive, we want to optimize with the following:

1. **Dependency tree analysis** — Narrow down the scope of impact from changes, minimizing snapshot targets
2. **Intent matching** — Cross-reference the change intent from commits/PRs with visual diffs, auto-approving expected changes

---

## 1. Existing Tools/Plugins Landscape

### AI-Powered VRT (Commercial)

| Tool | Approach | Features |
|------|----------|----------|
| **Applitools Eyes** | Proprietary Visual AI (CV-based) | Understands UI semantically. Ignores rendering noise. Most mature |
| **Percy Visual Review Agent** (BrowserStack) | Smart highlight + description generation | Natural language diffs like "header shifted 4px left". 40% false positive reduction. Human approval still needed |
| **Meticulous AI** | Session replay | Records user operations → replays. Flow-based, not static screenshots |
| **TestMu SmartUI** | Pixel + heuristics | Rule-based Smart Ignore (font rendering, etc.) |

### Dependency Tree-Aware VRT

| Tool | Approach | Features |
|------|----------|----------|
| **Chromatic TurboSnap** | Webpack/Vite Stats → module dependency graph | Maps changed files → affected Stories. 60-90% snapshot reduction. **Only implementation** |

### OSS VRT Tools (Pixel-based)

- **Playwright** built-in VRT (pixelmatch)
- **Lost Pixel** — Storybook/Ladle support
- **BackstopJS** — Viewport/scenario configuration
- **reg-suit / reg-cli** — CI integration, report generation
- **Visual-Regression-Tracker** — Self-hosted. Experimental VLM support

### Gaps (Unexplored Areas)

1. **LLM-based VRT reasoning**: No OSS tool sends screenshot diffs to a Vision LLM for judgment
2. **Dependency tree-aware VRT**: Chromatic TurboSnap monopoly. No OSS alternative for standalone Vite or arbitrary frameworks
3. **Intent-aware VRT**: Extracting change intent from commit messages/PR descriptions and cross-referencing with visual diffs is **completely unexplored**

---

## 2. Related Papers

### VRT Methodology/Optimization

- Moradi et al. (2024) — **"AI for Context-Aware Visual Change Detection"** [arXiv:2405.00874](https://arxiv.org/abs/2405.00874)
  - Detects UI controls with YOLOv5 → builds graph → determines meaningful changes from spatial context. Superior to pixel/region comparison
- Web Application Testing Survey (2024) [arXiv:2412.10476](https://arxiv.org/abs/2412.10476)
  - Survey of web testing research 2014-2023

### Dependency-Aware Test Selection

- **DIRTS** (ICST 2023) — DI framework-aware Regression Test Selection
- **Lam et al.** (ISSTA 2020) — Order-dependent test prioritization, selection, and parallelization. 80% failure reduction with dependency-aware algorithms
- **CORTS/C2RTS** (2025, J. Systems Architecture) — Component-based RTS. Module-level dependency graphs

### Self-Healing Test Automation

- Chede & Tijare (2025, IJRASET) — **"AI-Driven Self-Healing UI Testing with Visual Proof"**
  - Integration of DOM-based healing and semantic visual verification
- Self-Healing Test Automation with AI/ML (2024) — RL + image recognition + dynamic locators
- **SHML** (NeurIPS 2024) [arXiv:2411.00186](https://arxiv.org/abs/2411.00186) — Autonomous diagnosis/repair framework

### LLM/Vision Models × Testing

- **Wang et al.** (TSE 2024) — Survey of 102 studies on LLM × software testing [arXiv:2307.07221](https://arxiv.org/abs/2307.07221)
- **VisionDroid** (2024) [arXiv:2407.03037](https://arxiv.org/abs/2407.03037) — Multimodal LLM for GUI exploration + non-crash bug detection
- **Make LLM a Testing Expert** (ICSE 2024) — Functionality-aware mobile GUI testing
- **RepairAgent** (ICSE 2025) — LLM-based autonomous program repair agent
- Yu et al. (ACM Computing Surveys, 2025) — Vision-Based Mobile GUI Testing survey [arXiv:2310.13518](https://arxiv.org/abs/2310.13518)

### Reference Repositories

- [LLM4SoftwareTesting](https://github.com/LLM-Testing/LLM4SoftwareTesting) — Curated LLM × testing papers
- [GUI-Agents-Paper-List](https://github.com/OSU-NLP-Group/GUI-Agents-Paper-List) — GUI agent paper list

---

## 3. Discussion: Applicability to This Project

### Vision: Integration of Dependency Tree + Intent-Aware + AI Reasoning

```
Code Change
    │
    ├─ 1. Dependency tree analysis (low cost)
    │     Vite module graph / component import analysis
    │     → Identify affected components/pages
    │     → Minimize VRT snapshot targets (TurboSnap equivalent)
    │
    ├─ 2. Intent extraction (low-medium cost)
    │     Parse commit message / PR description with LLM
    │     → Structurize expectations like "change button color from blue to green"
    │
    ├─ 3. VRT execution (medium cost)
    │     Capture and compare only minimized snapshot targets
    │
    └─ 4. AI reasoning (high cost, conditional)
          Diffs matching intent → auto-approve
          Diffs not matching intent or unexpected → analyze with Vision LLM
          → Suggest repair or escalate to human review
```

### Cost Optimization Points

1. **Staged filtering**: Apply cheap filters first in order: dependency tree → intent matching → AI judgment
2. **Minimize AI calls**: Don't send all diffs to LLM; only pass those that can't be auto-approved
3. **Caching**: Cache similar diff patterns for the same component to avoid re-evaluation

### Technical Challenges

- How to obtain the Vite module graph (TurboSnap depends on Webpack Stats API)
- Accuracy of intent extraction (converting natural language → structured expected changes)
- Cost vs accuracy tradeoff of Vision LLM
- Reliability of self-healing (risk of automated fixes introducing unintended changes)

---

## 4. Next Steps

- [ ] PoC for dependency tree retrieval as a Vite plugin
- [ ] Minimal prototype of Playwright VRT + LLM reasoning
- [ ] Design intent extraction prompts
- [ ] Cost estimation (snapshot count × LLM API cost)

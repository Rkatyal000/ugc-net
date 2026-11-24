# NETPrep — UGC-NET Mock Test

A full-length, timed UGC-NET practice test that runs entirely in the browser:

- **Paper I** (General Paper on Teaching & Research Aptitude): 50 questions, **1 hour**
- **Paper II** (Code 90, Political Science incl. International Relations): 100 questions, **2 hours**
- 2 marks per question, no negative marking, **auto-submit when time runs out**
- Result page with the total score, section-wise strengths and weaknesses, time per question, revision tips, and a review of every answer with its explanation
- Progress is saved in the browser (a refresh never loses answers). Works on phones too.

It is a plain static site (HTML/CSS/JS) with no build step and no server.

## Run locally
Double-click `index.html`.

## Publish a public link (GitHub Pages, free)
1. Create an empty **public** repository on GitHub, e.g. `ugc-net-practice` (no README).
2. Push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/ugc-net-practice.git
   git push -u origin main
   ```
3. On GitHub, open **Settings → Pages**, set **Source: Deploy from a branch**, choose **Branch: `main` / root**, and save.
4. After about a minute the site is live at `https://<your-username>.github.io/ugc-net-practice/`.

Other options: drag the folder onto https://app.netlify.com/drop, or import the repo on Vercel.

## Files
| File | Purpose |
|---|---|
| `index.html` | Page shell |
| `styles.css` | All styling |
| `app.js` | Exam engine: timer, auto-submit, palette, scoring, analysis |
| `questions.js` | The 150 questions, answers, explanations and section tags (generated) |
| `tools/parse_pdfs.py` | Regenerates `questions.js` from the practice-paper PDFs' text |

## Updating questions
Extract the PDF text (e.g. with `pypdf`) and run:
```bash
python3 tools/parse_pdfs.py paper1.txt paper2.txt questions.js
```
Section tags are assigned in `tools/parse_pdfs.py` (`P1_SECTIONS`, `P2_SECTIONS`).

*Practice material. This is not an official NTA paper.*

"""Nghe lại từng file bằng Whisper, xoá file đọc sai để render.py tạo lại (tối đa 3 lần/câu).
Chạy: ~/Movies/MCND30/.venv/bin/python tools/voices/verify.py"""
import difflib, json, os, re
import mlx_whisper

HERE = os.path.dirname(os.path.abspath(__file__))
DEST = os.path.abspath(os.path.join(HERE, "..", "..", "src", "assets", "voices"))
data = json.load(open(os.path.join(HERE, "texts.json")))
ap = os.path.join(HERE, "attempts.json")
attempts = json.load(open(ap)) if os.path.exists(ap) else {}
okp = os.path.join(HERE, "verified.json")
verified = json.load(open(okp)) if os.path.exists(okp) else {}
norm = lambda s: re.sub(r"[^a-z0-9 ]", "", s.lower().replace("-", " ")).split()
bad = []
for t in data["jobs"]:
    if True:
        rel = f"{t['voice']}/{t['key']}"
        path = os.path.join(DEST, rel + ".mp3")
        if not os.path.exists(path) or verified.get(rel):
            continue
        heard = mlx_whisper.transcribe(path, path_or_hf_repo="mlx-community/whisper-small-mlx", language="en")["text"]
        a, b = norm(t["text"]), norm(heard)
        ratio = difflib.SequenceMatcher(None, " ".join(a), " ".join(b)).ratio()
        if ratio >= 0.72 or attempts.get(rel, 0) >= 3:
            verified[rel] = round(ratio, 2)
        else:
            attempts[rel] = attempts.get(rel, 0) + 1
            bad.append((rel, t["text"], heard.strip(), round(ratio, 2)))
            os.remove(path)
json.dump(attempts, open(ap, "w"), indent=1)
json.dump(verified, open(okp, "w"), indent=1)
for b in bad:
    print("BAD", *b)
print(f"VERIFY DONE bad={len(bad)}")

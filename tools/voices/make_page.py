"""Tạo trang nghe thử giọng (1 file HTML, âm thanh nhúng sẵn) từ voices.json + samples/*.mp3."""
import base64, json, os, html
HERE = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(HERE, "voices.json")))
cards = []
for v in meta:
    b64 = base64.b64encode(open(os.path.join(HERE, "samples", v["id"] + ".mp3"), "rb").read()).decode()
    num = v["id"].split("_")[0]
    cards.append(f"""<article class="card"><div class="num">{num}</div><div class="info"><h2>{html.escape(v['label'])}</h2>
<p class="tag">{html.escape(v['instruct'])}</p><audio controls preload="auto" src="data:audio/mpeg;base64,{b64}"></audio></div></article>""")
text = html.escape(meta[0]["text"])
page = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Giọng đọc mẫu</title><style>
:root{{--g:#04bc09;--ink:#444;--bg:#f7f7f7}}*{{box-sizing:border-box}}
body{{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--bg);color:var(--ink)}}
main{{max-width:1100px;margin:0 auto;padding:24px 16px 48px}}h1{{margin:0 0 4px;font-size:28px}}
.lead{{margin:0 0 20px;color:#6b6b6b}}.quote{{background:#fff;border-left:6px solid var(--g);padding:12px 16px;border-radius:10px;margin-bottom:20px;font-size:17px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}}
.card{{display:flex;gap:14px;background:#fff;border:2px solid #d9d9d9;border-radius:18px;padding:14px}}
.num{{flex:none;width:52px;height:52px;border-radius:14px;background:var(--g);color:#fff;font-weight:800;font-size:22px;display:grid;place-items:center}}
.info{{min-width:0;flex:1}}h2{{margin:0;font-size:18px}}.tag{{margin:2px 0 8px;font-size:13px;color:#6b6b6b}}audio{{width:100%}}
</style></head><body><main><h1>Giọng đọc mẫu OmniVoice</h1>
<p class="lead">12 giọng tiếng Anh, nam/nữ, nhiều độ tuổi. Nghe rồi chọn 4-5 giọng theo số thứ tự.</p>
<div class="quote">Câu đọc thử: “{text}”</div><div class="grid">{''.join(cards)}</div></main></body></html>"""
open(os.path.join(HERE, "giong-doc-mau.html"), "w").write(page)
print("ok", os.path.join(HERE, "giong-doc-mau.html"))

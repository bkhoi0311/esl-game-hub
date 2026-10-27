# Tạo trang duyệt hình: tools/pics/review.html (1 file, hình nhúng sẵn, mở thẳng bằng trình duyệt).
# Dùng: python3 tools/pics/review.py
import json, base64, os, html, re
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
P = lambda *a: os.path.join(ROOT, *a)
pics = json.load(open(P('src/data/pics.json')))
bank = json.load(open(P('src/data/wordbank/words.json')))
idx = json.load(open(P('src/data/library/index.json')))
LV = {'s': 'Starters', 'm': 'Movers', 'f': 'Flyers', 'k': 'KET', 'p': 'PET'}
PACK_LV = {'starters': 'Starters', 'movers': 'Movers', 'flyers': 'Flyers', 'ket': 'KET', 'pet': 'PET'}
level, example = {}, {}
for r in bank['rows']:
    if r[4] in LV: level.setdefault(r[0].lower(), LV[r[4]]); example.setdefault(r[0].lower(), r[5])
for p in idx:
    if p['level'] not in PACK_LV: continue
    for v in json.load(open(P('src/data/library/packs', p['id'] + '.json')))['vocab']:
        k = v['word'].strip().lower()
        level.setdefault(k, PACK_LV[p['level']]); example.setdefault(k, v.get('example', ''))
svgs, items = {}, []
for w, code in sorted(pics.items()):
    if w not in level: continue
    hint = code.startswith('~')
    code = code.lstrip('~')
    if not code.startswith('#') and code not in svgs:
        svgs[code] = base64.b64encode(open(P('public/pics', f'emoji_u{code}.svg'), 'rb').read()).decode()
    ex = example.get(w, '')
    # Câu gợi ý: giống clozeOf trong src/core/pics.js (từ + -s/-ed/-ing)
    h = re.sub(r'\b' + re.escape(w) + r"(s|es|ed|d|ing|'s)?\b", '___', ex, count=1, flags=re.I) if hint else ''
    if hint and h == ex: continue  # không có câu thì game không dùng hình này
    items.append({'w': w, 'c': code, 'l': level[w], 'e': ex, 'h': h})
data = json.dumps({'items': items, 'svgs': svgs}, separators=(',', ':'))
tpl = open(os.path.join(os.path.dirname(__file__), 'review.tpl.html'), encoding='utf-8').read()
open(os.path.join(os.path.dirname(__file__), 'review.html'), 'w', encoding='utf-8').write(tpl.replace('/*DATA*/null', data))
print(len(items), 'từ,', len(svgs), 'hình')

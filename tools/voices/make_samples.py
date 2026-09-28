"""Tạo giọng mẫu tiếng Anh bằng OmniVoice (voice design) để giáo viên nghe và chọn.
Chạy: ~/Movies/MCND30/voicetest/.venv/bin/python tools/voices/make_samples.py
Kết quả: tools/voices/samples/<id>.wav + .mp3, và voices.json (mô tả + seed để tạo lại đúng giọng)."""
import json, os, subprocess, time
import torch, soundfile as sf
from omnivoice import OmniVoice

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "samples")
FFMPEG = os.path.expanduser("~/.npm-global/bin/ffmpeg")
TEXT = "Hello, class! Are you ready to play? Listen and repeat: banana. She eats rice every day. Great job!"

VOICES = [
    ("01_girl_child_us", "Bé gái (trẻ em), giọng Mỹ", "female, child, high pitch, american accent"),
    ("02_boy_child_us", "Bé trai (trẻ em), giọng Mỹ", "male, child, american accent"),
    ("03_girl_teen_us", "Nữ thiếu niên, giọng Mỹ", "female, teenager, american accent"),
    ("04_boy_teen_uk", "Nam thiếu niên, giọng Anh", "male, teenager, british accent"),
    ("05_woman_young_us", "Nữ trẻ, giọng Mỹ", "female, young adult, american accent"),
    ("06_man_young_us", "Nam trẻ, giọng Mỹ", "male, young adult, moderate pitch, american accent"),
    ("07_woman_young_uk", "Nữ trẻ, giọng Anh", "female, young adult, british accent"),
    ("08_man_young_uk", "Nam trẻ, giọng Anh", "male, young adult, british accent"),
    ("09_woman_middle_us", "Nữ trung niên, giọng Mỹ", "female, middle-aged, american accent"),
    ("10_man_middle_uk", "Nam trung niên trầm, giọng Anh", "male, middle-aged, low pitch, british accent"),
    ("11_woman_elder_uk", "Bà (lớn tuổi), giọng Anh", "female, elderly, british accent"),
    ("12_man_elder_us", "Ông (lớn tuổi) trầm, giọng Mỹ", "male, elderly, low pitch, american accent"),
]

def main(only=None, seed_base=1000):
    """only: danh sách id cần tạo lại (giữ mô tả các giọng khác trong voices.json)."""
    os.makedirs(OUT, exist_ok=True)
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    t0 = time.time()
    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=dev, dtype=torch.float32)
    print("load", round(time.time() - t0, 1), "s on", dev, flush=True)
    path = os.path.join(HERE, "voices.json")
    old = {m["id"]: m for m in json.load(open(path))} if only and os.path.exists(path) else {}
    meta = []
    for i, (vid, label, instruct) in enumerate(VOICES):
        if only and vid not in only:
            meta.append(old[vid])
            continue
        seed = seed_base + i
        torch.manual_seed(seed)
        t1 = time.time()
        audio = model.generate(text=TEXT, instruct=instruct)
        a = audio[0] if isinstance(audio, (list, tuple)) else audio
        a = a.float().cpu().numpy().squeeze() if hasattr(a, "cpu") else a
        wav = os.path.join(OUT, f"{vid}.wav")
        sf.write(wav, a, 24000)
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "64k", wav[:-4] + ".mp3"], check=True)
        meta.append({"id": vid, "label": label, "instruct": instruct, "seed": seed, "text": TEXT})
        print(vid, "done", round(time.time() - t1, 1), "s", flush=True)
    with open(path, "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print("ALL DONE")

if __name__ == "__main__":
    import sys
    # python make_samples.py [seed_base] [id ...]
    args = sys.argv[1:]
    main(only=args[1:] or None, seed_base=int(args[0]) if args else 1000)

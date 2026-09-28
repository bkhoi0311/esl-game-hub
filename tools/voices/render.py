"""Thu âm sẵn các câu trong texts.json bằng OmniVoice, nhân bản từ giọng mẫu đã chọn.
Chạy (máy Mac có OmniVoice): ~/Movies/MCND30/voicetest/.venv/bin/python tools/voices/render.py
Chỉ tạo file còn thiếu: src/assets/voices/<voice>/<key>.mp3"""
import json, os, subprocess, sys, tempfile, time
import torch, soundfile as sf
from omnivoice import OmniVoice
from omnivoice.models.omnivoice import OmniVoiceGenerationConfig

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DEST = os.path.join(ROOT, "src", "assets", "voices")
FFMPEG = os.path.expanduser("~/.npm-global/bin/ffmpeg")
BATCH = 6
REF_TEXT = "Hello, class! Are you ready to play?"  # giọng gốc = đoạn đầu file mẫu, cắt sau chữ "play" (ref_cuts.json)
CONFIG = OmniVoiceGenerationConfig(num_step=16)
# Cắt khoảng lặng đầu/cuối, chuẩn hoá âm lượng, mp3 mono 22 kHz 40 kbps (nhẹ, đủ rõ lời).
AF = ("silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
      "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
      "apad=pad_dur=0.08,loudnorm=I=-17:TP=-1.5:LRA=11")

def main():
    data = json.load(open(os.path.join(HERE, "texts.json")))
    attempts_path = os.path.join(HERE, "attempts.json")
    attempts = json.load(open(attempts_path)) if os.path.exists(attempts_path) else {}
    only = set(sys.argv[1:])
    todo = []
    voices = {v["id"]: v for v in data["voices"]}
    for t in data["jobs"]:
        if only and t["voice"] not in only:
            continue
        path = os.path.join(DEST, t["voice"], t["key"] + ".mp3")
        if not os.path.exists(path):
            todo.append((voices[t["voice"]], t, path))
    print(f"{len(todo)} file cần tạo", flush=True)
    if not todo:
        return
    dev = "mps" if torch.backends.mps.is_available() else "cpu"
    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=dev, dtype=torch.float32)
    prompts = {}
    tmp = tempfile.mkdtemp()
    t0 = time.time()
    done = 0
    by_voice = {}
    for item in todo:
        by_voice.setdefault(item[0]["id"], []).append(item)
    for vid, items in by_voice.items():
        sample = [v for v in data["voices"] if v["id"] == vid][0]["sample"]
        wav = os.path.join(HERE, "samples", sample + ".ref.wav")
        prompts[vid] = model.create_voice_clone_prompt(ref_audio=wav, ref_text=REF_TEXT)
        os.makedirs(os.path.join(DEST, vid), exist_ok=True)
        for i in range(0, len(items), BATCH):
            chunk = items[i:i + BATCH]
            n = attempts.get(f"{vid}/{chunk[0][1]['key']}", 0)
            torch.manual_seed(7000 + n * 101 + i)
            audios = model.generate(text=[c[1]["text"] for c in chunk], voice_clone_prompt=[prompts[vid]] * len(chunk), generation_config=CONFIG)
            for (v, t, path), a in zip(chunk, audios):
                a = a.float().cpu().numpy().squeeze() if hasattr(a, "cpu") else a.squeeze()
                raw = os.path.join(tmp, t["key"] + ".wav")
                sf.write(raw, a, 24000)
                subprocess.run([FFMPEG, "-v", "error", "-y", "-i", raw, "-af", AF, "-ar", "22050", "-ac", "1", "-b:a", "40k", path], check=True)
                done += 1
            print(f"{vid} {done}/{len(todo)}  {round(time.time() - t0)}s", flush=True)
    print("RENDER DONE", flush=True)

if __name__ == "__main__":
    main()

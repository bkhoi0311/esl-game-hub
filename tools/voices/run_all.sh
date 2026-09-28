#!/bin/zsh
# Thu âm + kiểm tra bằng Whisper, lặp 3 vòng để tạo lại câu đọc sai.
cd "$(dirname $0)/../.."
for round in 1 2 3 4; do
  ~/Movies/MCND30/voicetest/.venv/bin/python tools/voices/render.py "$@" 2>&1 | grep -vE "[Ww]arn|it/s\]"
  ~/Movies/MCND30/.venv/bin/python tools/voices/verify.py 2>&1 | grep -E "BAD|VERIFY"
done
echo ALL ROUNDS DONE

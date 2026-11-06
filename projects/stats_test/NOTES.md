# stats_test — статистика ×10 с пометкой «ТЕСТ»

Запись экрана статистики (input/original.mp4), в которой значения заменены на ×10:
471→4710, 8→80, 1→10 (×3), 3 ч.:29 мин.:10 с.→34 ч.:51 мин.:40 с., 22.1 с.→221.0 с., 4.57%→45.70%,
подписи графика 564/376/188→5640/3760/1880. «Новые подписчики 0» остаются 0.
Поверх всего ролика — заметная пометка «ТЕСТ» (плашка в углу + полупрозрачный узор по всему кадру).

Как пересобрать:
1. Кадры: `ffmpeg -i input/original.mp4 -fps_mode passthrough out/frames/f%04d.png`,
   времена кадров: `ffprobe -select_streams v -show_entries frame=pts_time -of csv=p=0 input/original.mp4 > out/pts.txt`
2. `python3 tools/track.py` — отслеживание прокрутки (≈8 мин)
3. `python3 tools/refine.py` — уточнение положения цифр
4. `python3 tools/replace.py` — замена во всех кадрах; `python3 tools/qa.py` — проверка, что старых значений не осталось
5. `python3 tools/watermark.py && python3 tools/encode.py` — пометка «ТЕСТ», сборка с исходными таймингами и звуком

Шрифты: Roboto (карточки), TikTok Sans (строка под обложкой, подписи графика) — assets/fonts.

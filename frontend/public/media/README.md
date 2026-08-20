# Media

**`Spin.mp4`** is what the dashboard renders, via `SpineBackdrop`.

**`Final.mp4`** is the untouched source. It boomerangs: it sweeps out for 8.27s,
then replays that same sweep backwards for the remaining 8.3s, so looping it
reads as a wobble rather than a rotation. It is not a 360 — the far side of the
turn was never rendered.

`Spin.mp4` is derived from it: the unique sweep only (frames 0–247), downscaled
to 720p, audio stripped, and the wrap point cross-dissolved over 0.6s so the
motion never reverses. 33 MB → 0.6 MB.

Regenerating it (needs ffmpeg):

```bash
ffmpeg -i Final.mp4 -filter_complex "
[0:v]scale=1280:720,setsar=1,split=3[s1][s2][s3];
[s1]trim=start_frame=230:end_frame=248,setpts=PTS-STARTPTS,fps=30[b];
[s2]trim=start_frame=0:end_frame=18,setpts=PTS-STARTPTS,fps=30[h];
[s3]trim=start_frame=18:end_frame=230,setpts=PTS-STARTPTS,fps=30[t];
[b][h]xfade=transition=fade:duration=0.6:offset=0[x];
[x][t]concat=n=2:v=1[out]" \
 -map "[out]" -an -c:v libx264 -crf 28 -preset slow -pix_fmt yuv420p \
 -g 15 -movflags +faststart Spin.mp4
```

A genuine 360 needs a re-render from the source 3D model, not an edit of this
file. Render a full turn that ends one frame before returning to frame 0, and it
will loop with no dissolve at all.

Files in `public/` are served as-is by Vite and are not bundled.

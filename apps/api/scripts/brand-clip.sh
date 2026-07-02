#!/usr/bin/env bash
# Clip brand-wrap (our cyan/dark style) — overlays branding on a clip, full-frame,
# pure ffmpeg (no After Effects / Plainly). Aspect-agnostic (16:9, 9:16, 1:1).
#
# Elements: top + bottom scrims, a top-left BRAND wordmark (cyan dot), a cyan
# accent bar, a HEADLINE + SUBTITLE (fade in), a bottom-right CTA pill (fades in),
# and an animated cyan progress bar.
#
# Usage:
#   bash apps/api/scripts/brand-clip.sh <clip.mp4|url> "Headline" "Subtitle" out.mp4 "CTA" "Brand"
# Fields: HEADLINE required; SUBTITLE / CTA / BRAND optional (pass "" to skip).

set -euo pipefail

SRC="${1:?clip path or url}"
HEAD="${2:?headline}"
SUB="${3:-}"
OUT="${4:-branded.mp4}"
CTA="${5:-}"
BRAND="${6:-}"

HERE="$(cd "$(dirname "$0")" && pwd)"
BOLD="$HERE/../assets/fonts/SpaceGrotesk-Bold.ttf"
MED="$HERE/../assets/fonts/SpaceGrotesk-Medium.ttf"
CYAN="0x22D3EE"
DARK="0x0B1220"

CLIP="$SRC"; TMP=""
case "$SRC" in
  http://*|https://*) TMP="$(mktemp --suffix=.mp4)"; curl -sL -o "$TMP" "$SRC"; CLIP="$TMP" ;;
esac

H="$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$CLIP")"
DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CLIP")"
p() { echo $(( H * $1 / 1000 )); }      # permille of height → px

pad=$(p 60)
scrim_h=$(p 380); scrim_y=$(( H - scrim_h ))
top_h=$(p 150)
dot=$(p 26)
brand_y=$(p 60)
accent_y=$(( scrim_y + $(p 60) )); accent_h=$(( $(p 8) + 4 ))
head_size=$(p 75); head_y=$(( accent_y + accent_h + $(p 22) ))
sub_size=$(p 36); sub_y=$(( head_y + head_size + $(p 22) ))
pbar_h=$(( $(p 8) + 2 )); pbar_y=$(( H - pbar_h ))
fade="if(lt(t,0.5),t/0.5,1)"
ctafade="if(lt(t,0.8),0,if(lt(t,1.2),(t-0.8)/0.4,1))"

F="drawbox=x=0:y=0:w=iw:h=${top_h}:color=black@0.30:t=fill"
F="$F,drawbox=x=0:y=${scrim_y}:w=iw:h=${scrim_h}:color=black@0.45:t=fill"
# brand wordmark (top-left): cyan dot + text
if [ -n "$BRAND" ]; then
  F="$F,drawbox=x=${pad}:y=${brand_y}:w=${dot}:h=${dot}:color=${CYAN}:t=fill"
  F="$F,drawtext=fontfile='${BOLD}':text='${BRAND}':fontsize=$(p 34):fontcolor=white:x=${pad}+${dot}+$(p 16):y=${brand_y}-$(p 4)"
fi
# accent bar + headline + subtitle (fade in)
F="$F,drawbox=x=${pad}:y=${accent_y}:w=${head_size}:h=${accent_h}:color=${CYAN}:t=fill"
F="$F,drawtext=fontfile='${BOLD}':text='${HEAD}':fontsize=${head_size}:fontcolor=white:x=${pad}:y=${head_y}:alpha='${fade}':shadowcolor=black@0.5:shadowx=2:shadowy=2"
if [ -n "$SUB" ]; then
  F="$F,drawtext=fontfile='${MED}':text='${SUB}':fontsize=${sub_size}:fontcolor=${CYAN}:x=${pad}:y=${sub_y}:alpha='${fade}'"
fi
# CTA pill (bottom-right, fades in)
if [ -n "$CTA" ]; then
  F="$F,drawtext=fontfile='${BOLD}':text='${CTA}':fontsize=${sub_size}:fontcolor=${DARK}:box=1:boxcolor=${CYAN}:boxborderw=$(p 18):x=w-text_w-${pad}-$(p 18):y=${head_y}:alpha='${ctafade}'"
fi
# animated progress bar
F="$F,drawbox=x=0:y=${pbar_y}:w='iw*t/${DUR}':h=${pbar_h}:color=${CYAN}:t=fill"

ffmpeg -y -hide_banner -loglevel error -i "$CLIP" -vf "$F" \
  -map 0:v -map "0:a?" -c:v libx264 -preset medium -crf 20 -c:a copy "$OUT"

[ -n "$TMP" ] && rm -f "$TMP"
echo "wrote $OUT"

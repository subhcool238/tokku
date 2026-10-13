/* Generated from character.json by the tools in tools/. Do not edit. */
window.TOKKU_CHARACTER = {
 "version": 3,
 "spriteHeightPx": 560,
 "displayHeightPx": 230,
 "yaw": "0 = facing viewer, +90 = facing screen right, 180 = back, -90 = facing screen left",
 "ring": {
  "note": "12 views, 30 degrees apart. Each entry is a pose name; anchors and scale come from that pose.",
  "ring": [
   {
    "yaw": -150,
    "pose": "turn_210",
    "file": "v3/turn_210.png",
    "anchorX": 152,
    "feetY": 670,
    "scale": 0.775
   },
   {
    "yaw": -120,
    "pose": "turn_240",
    "file": "v3/turn_240.png",
    "anchorX": 154,
    "feetY": 666,
    "scale": 0.78
   },
   {
    "yaw": -90,
    "pose": "turn_270",
    "file": "v3/turn_270.png",
    "anchorX": 170,
    "feetY": 698,
    "scale": 0.744
   },
   {
    "yaw": -60,
    "pose": "turn_300",
    "file": "v3/turn_300.png",
    "anchorX": 194,
    "feetY": 698,
    "scale": 0.744
   },
   {
    "yaw": -30,
    "pose": "turn_330",
    "file": "v3/turn_330.png",
    "anchorX": 138,
    "feetY": 696,
    "scale": 0.746
   },
   {
    "yaw": 0,
    "pose": "turn_000",
    "file": "v3/turn_000.png",
    "anchorX": 270,
    "feetY": 693,
    "scale": 0.749
   },
   {
    "yaw": 30,
    "pose": "turn_030",
    "file": "v3/turn_030.png",
    "anchorX": 308,
    "feetY": 696,
    "scale": 0.746
   },
   {
    "yaw": 60,
    "pose": "turn_060",
    "file": "v3/turn_060.png",
    "anchorX": 334,
    "feetY": 698,
    "scale": 0.744
   },
   {
    "yaw": 90,
    "pose": "turn_090",
    "file": "v3/turn_090.png",
    "anchorX": 344,
    "feetY": 698,
    "scale": 0.744
   },
   {
    "yaw": 120,
    "pose": "turn_120",
    "file": "v3/turn_120.png",
    "anchorX": 316,
    "feetY": 666,
    "scale": 0.78
   },
   {
    "yaw": 150,
    "pose": "turn_150",
    "file": "v3/turn_150.png",
    "anchorX": 311,
    "feetY": 670,
    "scale": 0.775
   },
   {
    "yaw": 180,
    "pose": "turn_180",
    "file": "v3/turn_180.png",
    "anchorX": 284,
    "feetY": 680,
    "scale": 0.764
   }
  ]
 },
 "rig": {
  "w": 479,
  "h": 668,
  "anchorX": 244,
  "feetY": 636,
  "scale": 0.841,
  "standPx": 514.7,
  "layers": {
   "body": "rig_v3/body.png",
   "tail": "rig_v3/tail.png",
   "ear_l": "rig_v3/ear_l.png",
   "ear_r": "rig_v3/ear_r.png"
  },
  "overlays": {
   "blink_half": "rig_v3/blink_half.png",
   "blink_closed": "rig_v3/blink_closed.png",
   "mouth_open": "rig_v3/mouth_open.png"
  },
  "pivots": {
   "tail": [
    195,
    581
   ],
   "earL": [
    156,
    164
   ],
   "earR": [
    413,
    154
   ]
  },
  "tailRotationLimits": [
   -2,
   14
  ],
  "tailSign": -1,
  "note": "Art v3 idle. Draw order: tail, ear_l, ear_r, body, overlays. The tail is on the left, so tailSign is -1. Blink and mouth overlays are soft-edged patches cut from the other idle drawings."
 },
 "poses": {
  "walk_1": {
   "file": "v3/walk_1.png",
   "w": 531,
   "h": 626,
   "anchorX": 366,
   "feetY": 618,
   "scale": 0.8
  },
  "walk_2": {
   "file": "v3/walk_2.png",
   "w": 531,
   "h": 624,
   "anchorX": 358,
   "feetY": 615,
   "scale": 0.8
  },
  "walk_3": {
   "file": "v3/walk_3.png",
   "w": 530,
   "h": 626,
   "anchorX": 362,
   "feetY": 618,
   "scale": 0.8
  },
  "walk_4": {
   "file": "v3/walk_4.png",
   "w": 531,
   "h": 625,
   "anchorX": 344,
   "feetY": 617,
   "scale": 0.8
  },
  "walk_5": {
   "file": "v3/walk_5.png",
   "w": 530,
   "h": 580,
   "anchorX": 295,
   "feetY": 572,
   "scale": 0.868
  },
  "walk_6": {
   "file": "v3/walk_6.png",
   "w": 434,
   "h": 565,
   "anchorX": 298,
   "feetY": 557,
   "scale": 0.868
  },
  "walk_7": {
   "file": "v3/walk_7.png",
   "w": 442,
   "h": 575,
   "anchorX": 296,
   "feetY": 567,
   "scale": 0.868
  },
  "walk_8": {
   "file": "v3/walk_8.png",
   "w": 500,
   "h": 588,
   "anchorX": 312,
   "feetY": 580,
   "scale": 0.868
  },
  "walk_start_lean": {
   "file": "v3/walk_start_lean.png",
   "w": 439,
   "h": 655,
   "anchorX": 290,
   "feetY": 648,
   "scale": 0.789
  },
  "walk_start_step": {
   "file": "v3/walk_start_step.png",
   "w": 587,
   "h": 632,
   "anchorX": 436,
   "feetY": 625,
   "scale": 0.789
  },
  "walk_stop_slow": {
   "file": "v3/walk_stop_slow.png",
   "w": 496,
   "h": 655,
   "anchorX": 344,
   "feetY": 647,
   "scale": 0.789
  },
  "side_idle": {
   "file": "v3/side_idle.png",
   "w": 445,
   "h": 666,
   "anchorX": 294,
   "feetY": 658,
   "scale": 0.789
  },
  "turn_000": {
   "file": "v3/turn_000.png",
   "w": 428,
   "h": 701,
   "anchorX": 270,
   "feetY": 693,
   "scale": 0.749
  },
  "turn_030": {
   "file": "v3/turn_030.png",
   "w": 447,
   "h": 704,
   "anchorX": 308,
   "feetY": 696,
   "scale": 0.746
  },
  "turn_060": {
   "file": "v3/turn_060.png",
   "w": 529,
   "h": 706,
   "anchorX": 334,
   "feetY": 698,
   "scale": 0.744
  },
  "turn_090": {
   "file": "v3/turn_090.png",
   "w": 515,
   "h": 705,
   "anchorX": 344,
   "feetY": 698,
   "scale": 0.744
  },
  "turn_120": {
   "file": "v3/turn_120.png",
   "w": 472,
   "h": 674,
   "anchorX": 316,
   "feetY": 666,
   "scale": 0.78
  },
  "turn_150": {
   "file": "v3/turn_150.png",
   "w": 464,
   "h": 678,
   "anchorX": 311,
   "feetY": 670,
   "scale": 0.775
  },
  "turn_180": {
   "file": "v3/turn_180.png",
   "w": 463,
   "h": 687,
   "anchorX": 284,
   "feetY": 680,
   "scale": 0.764
  },
  "sleepy_stand": {
   "file": "v3/sleepy_stand.png",
   "w": 423,
   "h": 699,
   "anchorX": 283,
   "feetY": 691,
   "scale": 0.792,
   "faces": "right"
  },
  "yawn_sit": {
   "file": "v3/yawn_sit.png",
   "w": 522,
   "h": 667,
   "anchorX": 370,
   "feetY": 659,
   "scale": 0.75,
   "faces": "right"
  },
  "drowsy_sit": {
   "file": "v3/drowsy_sit.png",
   "w": 491,
   "h": 631,
   "anchorX": 262,
   "feetY": 621,
   "scale": 0.74,
   "faces": "right"
  },
  "sleep_curl": {
   "file": "v3/sleep_curl.png",
   "w": 506,
   "h": 388,
   "anchorX": 272,
   "feetY": 378,
   "scale": 0.732,
   "faces": "right"
  },
  "sleep_breathe_in": {
   "file": "v3/sleep_breathe_in.png",
   "w": 532,
   "h": 424,
   "anchorX": 293,
   "feetY": 416,
   "scale": 0.714
  },
  "sleep_breathe_out": {
   "file": "v3/sleep_breathe_out.png",
   "w": 509,
   "h": 408,
   "anchorX": 288,
   "feetY": 399,
   "scale": 0.757
  },
  "sleep_ear_twitch": {
   "file": "v3/sleep_ear_twitch.png",
   "w": 510,
   "h": 430,
   "anchorX": 290,
   "feetY": 422,
   "scale": 0.718
  },
  "sleep_tail_curl": {
   "file": "v3/sleep_tail_curl.png",
   "w": 516,
   "h": 413,
   "anchorX": 282,
   "feetY": 404,
   "scale": 0.761
  },
  "wake_lying": {
   "file": "v3/wake_lying.png",
   "w": 652,
   "h": 401,
   "anchorX": 479,
   "feetY": 393,
   "scale": 0.713
  },
  "stretch_up": {
   "file": "v3/stretch_up.png",
   "w": 439,
   "h": 683,
   "anchorX": 275,
   "feetY": 676,
   "scale": 0.856,
   "faces": "right"
  },
  "awake_front": {
   "file": "v3/awake_front.png",
   "w": 431,
   "h": 678,
   "anchorX": 276,
   "feetY": 670,
   "scale": 0.937
  },
  "wake_ear_lift": {
   "file": "v3/wake_ear_lift.png",
   "w": 511,
   "h": 383,
   "anchorX": 288,
   "feetY": 373,
   "scale": 0.73
  },
  "wake_peek": {
   "file": "v3/wake_peek.png",
   "w": 596,
   "h": 328,
   "anchorX": 383,
   "feetY": 320,
   "scale": 0.706
  },
  "wake_yawn_lying": {
   "file": "v3/wake_yawn_lying.png",
   "w": 534,
   "h": 428,
   "anchorX": 394,
   "feetY": 420,
   "scale": 0.73,
   "faces": "right"
  },
  "wake_sit_rub": {
   "file": "v3/wake_sit_rub.png",
   "w": 487,
   "h": 553,
   "anchorX": 320,
   "feetY": 545,
   "scale": 0.73
  },
  "notice": {
   "file": "v3/notice.png",
   "w": 412,
   "h": 679,
   "anchorX": 253,
   "feetY": 671,
   "scale": 0.783,
   "faces": "right"
  },
  "wave_hello": {
   "file": "v3/wave_hello.png",
   "w": 494,
   "h": 675,
   "anchorX": 290,
   "feetY": 667,
   "scale": 0.803
  },
  "paw_stop": {
   "file": "v3/paw_stop.png",
   "w": 506,
   "h": 687,
   "anchorX": 212,
   "feetY": 679,
   "scale": 0.76
  },
  "plead": {
   "file": "v3/plead.png",
   "w": 449,
   "h": 679,
   "anchorX": 283,
   "feetY": 671,
   "scale": 0.762,
   "faces": "right"
  },
  "hopeful": {
   "file": "v3/hopeful.png",
   "w": 447,
   "h": 694,
   "anchorX": 294,
   "feetY": 686,
   "scale": 0.77,
   "faces": "right"
  },
  "accept_thumbs": {
   "file": "v3/accept_thumbs.png",
   "w": 497,
   "h": 694,
   "anchorX": 312,
   "feetY": 686,
   "scale": 0.76,
   "faces": "right"
  },
  "sulk": {
   "file": "v3/sulk.png",
   "w": 473,
   "h": 677,
   "anchorX": 304,
   "feetY": 669,
   "scale": 0.75
  },
  "surprise_neutral": {
   "file": "v3/surprise_neutral.png",
   "w": 489,
   "h": 655,
   "anchorX": 321,
   "feetY": 647,
   "scale": 0.83
  },
  "surprise_start": {
   "file": "v3/surprise_start.png",
   "w": 505,
   "h": 670,
   "anchorX": 302,
   "feetY": 662,
   "scale": 0.789,
   "faces": "right"
  },
  "surprise_strong": {
   "file": "v3/surprise_strong.png",
   "w": 525,
   "h": 667,
   "anchorX": 448,
   "feetY": 659,
   "scale": 0.794,
   "faces": "right"
  },
  "surprise_recover": {
   "file": "v3/surprise_recover.png",
   "w": 502,
   "h": 657,
   "anchorX": 316,
   "feetY": 649,
   "scale": 0.816
  },
  "joy_excited": {
   "file": "v3/joy_excited.png",
   "w": 451,
   "h": 676,
   "anchorX": 276,
   "feetY": 669,
   "scale": 0.754,
   "faces": "right"
  },
  "joy_cheer_leg": {
   "file": "v3/joy_cheer_leg.png",
   "w": 530,
   "h": 680,
   "anchorX": 172,
   "feetY": 672,
   "scale": 0.777
  },
  "joy_jump": {
   "file": "v3/joy_jump.png",
   "w": 497,
   "h": 671,
   "anchorX": 274,
   "feetY": 693,
   "scale": 0.811,
   "airPx": 30
  },
  "joy_wink_thumbs": {
   "file": "v3/joy_wink_thumbs.png",
   "w": 506,
   "h": 669,
   "anchorX": 318,
   "feetY": 661,
   "scale": 0.755,
   "faces": "right"
  },
  "inspect_low": {
   "file": "v3/inspect_low.png",
   "w": 531,
   "h": 570,
   "anchorX": 348,
   "feetY": 562,
   "scale": 0.752,
   "faces": "right"
  },
  "think_chin": {
   "file": "v3/think_chin.png",
   "w": 443,
   "h": 657,
   "anchorX": 272,
   "feetY": 649,
   "scale": 0.782,
   "faces": "right"
  },
  "found_point": {
   "file": "v3/found_point.png",
   "w": 545,
   "h": 654,
   "anchorX": 312,
   "feetY": 646,
   "scale": 0.789,
   "faces": "right"
  },
  "done_thumbs": {
   "file": "v3/done_thumbs.png",
   "w": 439,
   "h": 679,
   "anchorX": 273,
   "feetY": 671,
   "scale": 0.735,
   "faces": "right"
  },
  "done_cheer": {
   "file": "v3/done_cheer.png",
   "w": 511,
   "h": 664,
   "anchorX": 168,
   "feetY": 657,
   "scale": 0.75
  },
  "done_checkmark": {
   "file": "v3/done_checkmark.png",
   "w": 533,
   "h": 677,
   "anchorX": 294,
   "feetY": 669,
   "scale": 0.73
  },
  "done_proud": {
   "file": "v3/done_proud.png",
   "w": 467,
   "h": 691,
   "anchorX": 290,
   "feetY": 683,
   "scale": 0.774,
   "faces": "right"
  },
  "annoyed_mild": {
   "file": "v3/annoyed_mild.png",
   "w": 450,
   "h": 635,
   "anchorX": 283,
   "feetY": 627,
   "scale": 0.775,
   "faces": "right"
  },
  "annoyed_question": {
   "file": "v3/annoyed_question.png",
   "w": 523,
   "h": 643,
   "anchorX": 292,
   "feetY": 635,
   "scale": 0.767,
   "faces": "right"
  },
  "annoyed_angry": {
   "file": "v3/annoyed_angry.png",
   "w": 529,
   "h": 521,
   "anchorX": 288,
   "feetY": 514,
   "scale": 0.78,
   "faces": "right"
  },
  "drag_grab": {
   "file": "v3/drag_grab.png",
   "w": 464,
   "h": 613,
   "anchorX": 80,
   "feetY": 603,
   "scale": 0.835,
   "airPx": 2
  },
  "drag_hang": {
   "file": "v3/drag_hang.png",
   "w": 366,
   "h": 613,
   "anchorX": 90,
   "feetY": 606,
   "scale": 0.873,
   "airPx": 4
  },
  "drag_land": {
   "file": "v3/drag_land.png",
   "w": 535,
   "h": 464,
   "anchorX": 344,
   "feetY": 456,
   "scale": 0.76
  },
  "drag_sit": {
   "file": "v3/drag_sit.png",
   "w": 477,
   "h": 559,
   "anchorX": 301,
   "feetY": 551,
   "scale": 0.875,
   "faces": "right"
  },
  "quiet_back_sit": {
   "file": "v3/quiet_back_sit.png",
   "w": 492,
   "h": 549,
   "anchorX": 240,
   "feetY": 541,
   "scale": 0.8
  },
  "quiet_rest_curl": {
   "file": "v3/quiet_rest_curl.png",
   "w": 591,
   "h": 339,
   "anchorX": 216,
   "feetY": 329,
   "scale": 0.66
  },
  "break_stretch": {
   "file": "v3/break_stretch.png",
   "w": 446,
   "h": 653,
   "anchorX": 278,
   "feetY": 645,
   "scale": 0.76,
   "faces": "right"
  },
  "break_yawn": {
   "file": "v3/break_yawn.png",
   "w": 468,
   "h": 649,
   "anchorX": 292,
   "feetY": 641,
   "scale": 0.782,
   "faces": "right"
  },
  "break_sit_relaxed": {
   "file": "v3/break_sit_relaxed.png",
   "w": 510,
   "h": 494,
   "anchorX": 249,
   "feetY": 486,
   "scale": 0.795,
   "faces": "right"
  },
  "break_lie_rest": {
   "file": "v3/break_lie_rest.png",
   "w": 583,
   "h": 324,
   "anchorX": 337,
   "feetY": 316,
   "scale": 0.74
  },
  "away_look_away": {
   "file": "v3/away_look_away.png",
   "w": 455,
   "h": 629,
   "anchorX": 275,
   "feetY": 620,
   "scale": 0.792,
   "faces": "left"
  },
  "away_check_time": {
   "file": "v3/away_check_time.png",
   "w": 488,
   "h": 653,
   "anchorX": 286,
   "feetY": 645,
   "scale": 0.77
  },
  "away_pace": {
   "file": "v3/away_pace.png",
   "w": 566,
   "h": 623,
   "anchorX": 374,
   "feetY": 615,
   "scale": 0.808
  },
  "away_sigh": {
   "file": "v3/away_sigh.png",
   "w": 499,
   "h": 662,
   "anchorX": 322,
   "feetY": 654,
   "scale": 0.775,
   "faces": "right"
  },
  "walkd_stand": {
   "file": "v3/walkd_stand.png",
   "w": 314,
   "h": 328,
   "anchorX": 231,
   "feetY": 320,
   "scale": 1.639
  },
  "walkd_1": {
   "file": "v3/walkd_1.png",
   "w": 308,
   "h": 322,
   "anchorX": 224,
   "feetY": 314,
   "scale": 1.639
  },
  "walkd_2": {
   "file": "v3/walkd_2.png",
   "w": 339,
   "h": 327,
   "anchorX": 247,
   "feetY": 319,
   "scale": 1.639
  },
  "walkd_3": {
   "file": "v3/walkd_3.png",
   "w": 316,
   "h": 325,
   "anchorX": 232,
   "feetY": 316,
   "scale": 1.639
  },
  "walkd_4": {
   "file": "v3/walkd_4.png",
   "w": 320,
   "h": 324,
   "anchorX": 236,
   "feetY": 316,
   "scale": 1.639
  },
  "walkd_5": {
   "file": "v3/walkd_5.png",
   "w": 333,
   "h": 324,
   "anchorX": 250,
   "feetY": 315,
   "scale": 1.639
  },
  "turn_210": {
   "file": "v3/turn_210.png",
   "w": 464,
   "h": 678,
   "anchorX": 152,
   "feetY": 670,
   "scale": 0.775
  },
  "turn_240": {
   "file": "v3/turn_240.png",
   "w": 472,
   "h": 674,
   "anchorX": 154,
   "feetY": 666,
   "scale": 0.78
  },
  "turn_270": {
   "file": "v3/turn_270.png",
   "w": 515,
   "h": 705,
   "anchorX": 170,
   "feetY": 698,
   "scale": 0.744
  },
  "turn_300": {
   "file": "v3/turn_300.png",
   "w": 529,
   "h": 706,
   "anchorX": 194,
   "feetY": 698,
   "scale": 0.744
  },
  "turn_330": {
   "file": "v3/turn_330.png",
   "w": 447,
   "h": 704,
   "anchorX": 138,
   "feetY": 696,
   "scale": 0.746
  },
  "idle_a": {
   "file": "_old/poses/idle_a.png",
   "w": 347,
   "h": 552,
   "anchorX": 130,
   "feetY": 550,
   "scale": 1,
   "legacy": true
  },
  "idle_b": {
   "file": "_old/poses/idle_b.png",
   "w": 253,
   "h": 548,
   "anchorX": 126,
   "feetY": 546,
   "scale": 1.05,
   "legacy": true
  },
  "idle": {
   "file": "_old/poses/idle.png",
   "w": 309,
   "h": 550,
   "anchorX": 131,
   "feetY": 548,
   "scale": 1.0,
   "legacy": true
  },
  "look_tilt": {
   "file": "_old/poses/look_tilt.png",
   "w": 311,
   "h": 536,
   "anchorX": 180,
   "feetY": 534,
   "scale": 0.93,
   "legacy": true
  },
  "idle_tail_left": {
   "file": "_old/poses/idle_tail_left.png",
   "w": 317,
   "h": 530,
   "anchorX": 184,
   "feetY": 528,
   "scale": 0.97,
   "legacy": true
  },
  "calm_curled_tail": {
   "file": "_old/poses/calm_curled_tail.png",
   "w": 341,
   "h": 470,
   "anchorX": 122,
   "feetY": 468,
   "scale": 1.1,
   "legacy": true
  },
  "turn_left_3q": {
   "file": "_old/poses/turn_left_3q.png",
   "w": 395,
   "h": 476,
   "anchorX": 125,
   "feetY": 474,
   "scale": 1.1,
   "legacy": true
  },
  "happy_talk": {
   "file": "_old/poses/happy_talk.png",
   "w": 399,
   "h": 494,
   "anchorX": 123,
   "feetY": 492,
   "scale": 1.1,
   "legacy": true
  },
  "celebrate": {
   "file": "_old/poses/celebrate.png",
   "w": 474,
   "h": 486,
   "anchorX": 222,
   "feetY": 484,
   "scale": 1.0,
   "legacy": true
  },
  "annoyed_sit": {
   "file": "_old/poses/annoyed_sit.png",
   "w": 424,
   "h": 452,
   "anchorX": 180,
   "feetY": 450,
   "scale": 1.0,
   "legacy": true
  },
  "pleading": {
   "file": "_old/poses/pleading.png",
   "w": 275,
   "h": 444,
   "anchorX": 125,
   "feetY": 442,
   "scale": 1.08,
   "legacy": true
  },
  "sleep_small": {
   "file": "_old/poses/sleep_small.png",
   "w": 377,
   "h": 319,
   "anchorX": 185,
   "feetY": 317,
   "scale": 0.95,
   "legacy": true
  },
  "sit_drowsy": {
   "file": "_old/poses/sit_drowsy.png",
   "w": 375,
   "h": 419,
   "anchorX": 229,
   "feetY": 417,
   "scale": 1.1,
   "legacy": true
  },
  "yawn": {
   "file": "_old/poses/yawn.png",
   "w": 383,
   "h": 391,
   "anchorX": 212,
   "feetY": 389,
   "scale": 1.05,
   "legacy": true
  },
  "sleep_curl_b": {
   "file": "_old/poses/sleep_curl_b.png",
   "w": 446,
   "h": 273,
   "anchorX": 228,
   "feetY": 271,
   "scale": 0.88,
   "legacy": true
  },
  "lying_wake": {
   "file": "_old/poses/lying_wake.png",
   "w": 432,
   "h": 285,
   "anchorX": 192,
   "feetY": 283,
   "scale": 0.95,
   "legacy": true
  },
  "stretch": {
   "file": "_old/poses/stretch.png",
   "w": 399,
   "h": 456,
   "anchorX": 190,
   "feetY": 454,
   "scale": 1.1,
   "legacy": true
  },
  "walk_a": {
   "file": "_old/poses/walk_a.png",
   "w": 540,
   "h": 387,
   "anchorX": 338,
   "feetY": 385,
   "scale": 1.1,
   "legacy": true
  },
  "walk_b": {
   "file": "_old/poses/walk_b.png",
   "w": 476,
   "h": 369,
   "anchorX": 300,
   "feetY": 367,
   "scale": 1.15,
   "legacy": true
  },
  "jump_happy": {
   "file": "_old/poses/jump_happy.png",
   "w": 417,
   "h": 417,
   "anchorX": 268,
   "feetY": 415,
   "scale": 1.05,
   "legacy": true
  },
  "annoyed_crouch": {
   "file": "_old/poses/annoyed_crouch.png",
   "w": 524,
   "h": 379,
   "anchorX": 262,
   "feetY": 377,
   "scale": 1.0,
   "legacy": true
  },
  "curious_crouch": {
   "file": "_old/poses/curious_crouch.png",
   "w": 484,
   "h": 387,
   "anchorX": 203,
   "feetY": 385,
   "scale": 0.92,
   "legacy": true
  }
 },
 "walk": {
  "right": [
   "walkd_2",
   "walkd_3",
   "walkd_5",
   "walkd_1"
  ],
  "start": [
   "walkd_stand"
  ],
  "stop": [
   "walkd_stand"
  ],
  "framePx": 30,
  "fadeMs": 70,
  "note": "From the detailed walk sheet (W01), right facing row: stride, passing, stride, passing. The frame advances every framePx screen pixels, with a short blend. Mirror for left."
 },
 "scaleNote": "Per-pose \"scale\" gives every frame the same head size. Measured by tools/cut_sprites.py as the biggest circle that fits in the head. Manual corrections: art/scale-overrides.json.",
 "sequences": {
  "walk_start": {
   "frames": [
    {
     "pose": "walk_start_lean",
     "ms": 120
    },
    {
     "pose": "walk_start_step",
     "ms": 120
    }
   ]
  },
  "walk_cycle": {
   "frames": [
    {
     "pose": "walk_1"
    },
    {
     "pose": "walk_2"
    },
    {
     "pose": "walk_3"
    },
    {
     "pose": "walk_4"
    },
    {
     "pose": "walk_5"
    },
    {
     "pose": "walk_6"
    },
    {
     "pose": "walk_7"
    },
    {
     "pose": "walk_8"
    }
   ],
   "advance": "distance",
   "loop": true
  },
  "walk_stop": {
   "frames": [
    {
     "pose": "walk_stop_slow",
     "ms": 140
    },
    {
     "pose": "side_idle",
     "ms": 160
    }
   ]
  },
  "attention": {
   "frames": [
    {
     "pose": "wave_hello",
     "ms": 0
    }
   ],
   "hold": "wave_hello"
  },
  "plead": {
   "frames": [
    {
     "pose": "plead",
     "ms": 1800
    }
   ]
  },
  "accept": {
   "frames": [
    {
     "pose": "paw_stop",
     "ms": 1400
    }
   ],
   "end": "rig"
  },
  "thanks": {
   "frames": [
    {
     "pose": "accept_thumbs",
     "ms": 1300
    }
   ],
   "end": "rig"
  },
  "sigh": {
   "frames": [
    {
     "pose": "away_sigh",
     "ms": 1600
    }
   ],
   "end": "rig"
  },
  "sulk": {
   "frames": [
    {
     "pose": "sulk",
     "ms": 1500
    }
   ],
   "end": "rig"
  },
  "rest": {
   "frames": [
    {
     "pose": "break_sit_relaxed",
     "ms": 0
    }
   ],
   "hold": "break_sit_relaxed"
  },
  "stretch_up": {
   "frames": [
    {
     "pose": "break_stretch",
     "ms": 1000
    }
   ],
   "end": "rig"
  },
  "sleep_in": {
   "frames": [
    {
     "pose": "sleepy_stand",
     "ms": 500
    },
    {
     "pose": "yawn_sit",
     "ms": 750
    },
    {
     "pose": "drowsy_sit",
     "ms": 650
    }
   ]
  },
  "wake": {
   "frames": [
    {
     "pose": "wake_yawn_lying",
     "ms": 600
    },
    {
     "pose": "wake_sit_rub",
     "ms": 600
    },
    {
     "pose": "stretch_up",
     "ms": 650
    }
   ],
   "end": "rig"
  },
  "celebrate": {
   "frames": [
    {
     "pose": "joy_excited",
     "ms": 450
    },
    {
     "pose": "joy_jump",
     "ms": 450
    },
    {
     "pose": "done_checkmark",
     "ms": 1200
    },
    {
     "pose": "done_proud",
     "ms": 900
    }
   ],
   "end": "rig",
   "hop": {
    "at": "joy_jump",
    "heightPx": 14
   }
  },
  "annoyed_1": {
   "frames": [
    {
     "pose": "annoyed_mild",
     "ms": 1600
    }
   ],
   "end": "rig"
  },
  "annoyed_2": {
   "frames": [
    {
     "pose": "annoyed_question",
     "ms": 1600
    }
   ],
   "end": "rig"
  },
  "annoyed_3": {
   "frames": [
    {
     "pose": "annoyed_angry",
     "ms": 1800
    }
   ],
   "end": "rig"
  },
  "drag_start": {
   "frames": [
    {
     "pose": "drag_grab",
     "ms": 120
    },
    {
     "pose": "drag_hang",
     "ms": 0
    }
   ],
   "hold": "drag_hang"
  },
  "drag_end": {
   "frames": [
    {
     "pose": "drag_land",
     "ms": 260
    },
    {
     "pose": "drag_sit",
     "ms": 900
    }
   ]
  },
  "quiet_on": {
   "frames": [
    {
     "pose": "quiet_back_sit",
     "ms": 0
    }
   ],
   "hold": "quiet_back_sit",
   "before": "turn:180",
   "dim": 0.55
  },
  "quiet_off": {
   "frames": [
    {
     "pose": "quiet_back_sit",
     "ms": 250
    }
   ],
   "after": "turn:0",
   "end": "rig"
  },
  "welcome_back": {
   "frames": [
    {
     "pose": "wave_hello",
     "ms": 1700
    }
   ],
   "end": "rig"
  },
  "surprise": {
   "frames": [
    {
     "pose": "surprise_start",
     "ms": 250
    },
    {
     "pose": "surprise_strong",
     "ms": 1000
    }
   ],
   "end": "rig"
  },
  "point_at_task": {
   "frames": [
    {
     "pose": "found_point",
     "ms": 0
    }
   ],
   "hold": "found_point"
  },
  "idle_inspect": {
   "frames": [
    {
     "pose": "inspect_low",
     "ms": 1600
    }
   ],
   "end": "rig"
  },
  "idle_glance": {
   "frames": [
    {
     "pose": "turn_030",
     "ms": 600
    }
   ],
   "end": "rig"
  }
 },
 "legacyNote": "Poses marked legacy are the old art in assets/_old. The engine uses them until Phase 1B.",
 "rig_old": {
  "w": 309,
  "h": 550,
  "anchorX": 131,
  "feetY": 548,
  "layers": {
   "body": "rig/body.png",
   "tail": "rig/tail.png",
   "ear_l": "rig/ear_l.png",
   "ear_r": "rig/ear_r.png"
  },
  "overlays": {
   "blink_half": "rig/blink_half.png",
   "blink_closed": "rig/blink_closed.png",
   "mouth_open": "rig/mouth_open.png"
  },
  "pivots": {
   "tail": [
    252,
    468
   ],
   "earL": [
    32,
    104
   ],
   "earR": [
    234,
    104
   ]
  },
  "tailRotationLimits": [
   -2,
   24
  ],
  "note": "Draw order: tail, ear_l, ear_r, body, overlays. Positive tail angle swings the tip up and toward the body. Below -2 degrees a gap shows at the tail root.",
  "note2": "Old idle rig (art v2), kept for reference. Files are in assets/rig."
 }
};

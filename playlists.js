/* ============================================================
   ck-player — playlists
   ------------------------------------------------------------
   THIS is the only file you edit to put the player somewhere new.
   Add a playlist, then point the embed at it with ?list=<key>:

     https://clayburton.github.io/ck-player/?list=i-am

   The module is exactly as tall as the list it renders — five
   tracks make a five-track-tall player, two make a two.

   track = {
     title : shown big, mono                      (required)
     meta  : small serif italic column            (optional)
     dur   : seconds — shown until the file loads (optional)
     src   : audio URL. MUST send CORS headers if
             it's on another origin, or the live
             waveform can't be read (GitHub Pages
             and jsDelivr both send them).        (optional)
     url   : where "[ ↗ ]" goes — the song's page  (optional)
   }
   A track with no src is a link-only row: no play, still hoverable.
   ============================================================ */

window.PLAYLISTS = {

  /* ---- everything, for the bottom of /music/ ---- */
  "music": {
    tag:  "[ listen ]",
    note: "clay and kelsy",
    foot: { label: "[ experience i am ]", href: "https://clayandkelsy.com/i-am/" },
    sign: "clay and kelsy",
    cta:  { label: "[ explore retrospective ]", href: "https://clayandkelsy.com/retrospective/" },
    tracks: [
      { title: "three little birds", meta: "feat. elder sister", dur: 203.5, src: "assets/three-little-birds.mp3" },
      /* mirror goes here — drop the audio into "Music for player 1/mirror/",
         re-run tools/waveforms.py, and uncomment:
      { title: "mirror", meta: "single", dur: 0, src: "assets/mirror.mp3" },
      */
      { title: "insecure",       meta: "i am", dur: 181.0, src: "assets/insecure.mp3",       url: "https://clayandkelsy.com/i-am-insecure/" },
      { title: "you hurt me",    meta: "i am", dur: 218.4, src: "assets/you-hurt-me.mp3",    url: "https://clayandkelsy.com/i-am-you-hurt-me/" },
      { title: "i miss you",     meta: "i am", dur: 213.6, src: "assets/i-miss-you.mp3",     url: "https://clayandkelsy.com/i-am-i-miss-you/" },
      { title: "memories of me", meta: "i am", dur: 197.1, src: "assets/memories-of-me.mp3", url: "https://clayandkelsy.com/i-am-memories-of-me/" },
      { title: "i am",           meta: "i am", dur: 198.7, src: "assets/i-am.mp3",           url: "https://clayandkelsy.com/i-am-i-am/" },
    ],
  },

  /* ---- the "i am" EP on its own — the album hub ---- */
  "i-am": {
    tag:  "[ listen ]",
    note: "i am — an ep",
    foot: { label: "[ experience i am ]", href: "https://clayandkelsy.com/i-am/" },
    sign: "clay and kelsy",
    cta:  { label: "[ explore retrospective ]", href: "https://clayandkelsy.com/retrospective/" },
    /* encoded from the album masters in "Music for player 1/i am" */
    tracks: [
      { title: "insecure",       meta: "i am", dur: 181.0, src: "assets/insecure.mp3",       url: "https://clayandkelsy.com/i-am-insecure/" },
      { title: "you hurt me",    meta: "i am", dur: 218.4, src: "assets/you-hurt-me.mp3",    url: "https://clayandkelsy.com/i-am-you-hurt-me/" },
      { title: "i miss you",     meta: "i am", dur: 213.6, src: "assets/i-miss-you.mp3",     url: "https://clayandkelsy.com/i-am-i-miss-you/" },
      { title: "memories of me", meta: "i am", dur: 197.1, src: "assets/memories-of-me.mp3", url: "https://clayandkelsy.com/i-am-memories-of-me/" },
      { title: "i am",           meta: "i am", dur: 198.7, src: "assets/i-am.mp3",           url: "https://clayandkelsy.com/i-am-i-am/" },
    ],
  },

  /* ---- a two-track cut, to show the module sizing itself ---- */
  "i-am-two": {
    tag:  "[ listen ]",
    note: "two from the ep",
    foot: { label: "[ the whole ep ]", href: "https://clayandkelsy.com/i-am/" },
    sign: "clay and kelsy",
    cta:  { label: "[ explore retrospective ]", href: "https://clayandkelsy.com/retrospective/" },
    tracks: [
      { title: "i am",     meta: "i am", dur: 198.7, src: "assets/i-am.mp3",     url: "https://clayandkelsy.com/i-am-i-am/" },
      { title: "insecure", meta: "i am", dur: 181.0, src: "assets/insecure.mp3", url: "https://clayandkelsy.com/i-am-insecure/" },
    ],
  },

};

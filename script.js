const SUPABASE_URL = "https://qguunpxlgswkqnpwhcnc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__L4vzMI9rSqZs33TkUZHFg_UTbupETn";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let mockSongs = [];
let freeSongs = [];
let playingId = null;
let playerTitle = "";
let playerArtist = "";
let currentTime = 0;
let duration = 0;
let mockTimer = null;
let volume = 80;
let rafId = null;
let lastMockTick = 0;
let isSeeking = false;
let currentProductListy = "all";

const audio = document.getElementById("audio");
const player = document.getElementById("player");
const playerTitleEl = document.getElementById("playerTitle");
const playerArtistEl = document.getElementById("playerArtist");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const volumeEl = document.getElementById("volume");
const volumeText = document.getElementById("volumeText");
const waveform = document.getElementById("waveform");

if (!document.getElementById("fullWaveformStyle")) {
  const style = document.createElement("style");
  style.id = "fullWaveformStyle";
  style.textContent = `
    .waveform{
      justify-content:space-between !important;
      gap:2px !important;
      padding:0 10px !important;
    }
    .wave-bar{
      flex:1 1 auto !important;
      width:auto !important;
      min-width:2px;
      max-width:5px;
    }
    @media (max-width:640px){
      .waveform{
        gap:1px !important;
        padding:0 6px !important;
      }
      .wave-bar{
        min-width:1px;
        max-width:4px;
      }
    }
  `;
  document.head.appendChild(style);
}

const skipBtn = document.getElementById("skipBtn");

let rewindBtn = document.getElementById("rewindBtn");
if (!rewindBtn && skipBtn) {
  rewindBtn = document.createElement("button");
  rewindBtn.id = "rewindBtn";
  rewindBtn.className = "skip-btn";
  rewindBtn.textContent = "⏪ -15s";
  skipBtn.parentNode.insertBefore(rewindBtn, skipBtn);
}

if (skipBtn) {
  skipBtn.textContent = "⏩ +15s";
}

if (!document.getElementById("playerLayoutFixStyle")) {
  const style = document.createElement("style");
  style.id = "playerLayoutFixStyle";
  style.textContent = `
    .controls-row{
      gap:10px;
      flex-wrap:wrap;
    }
    #rewindBtn,
    #skipBtn{
      white-space:nowrap;
      min-width:82px;
    }
    .volume-row{
      flex:0 0 210px;
      margin-left:auto;
    }
    .volume-row input{
      max-width:120px;
    }
    .waveform{
      touch-action:none;
      user-select:none;
      cursor:pointer;
    }
    .playhead{
      transition:left .04s linear;
    }
    @media (max-width:640px){
      .controls-row{
        flex-direction:row !important;
        align-items:center !important;
      }
      .track-info{
        width:100%;
        flex-basis:100%;
      }
      .volume-row{
        flex:1 1 100%;
        margin-left:0;
      }
      .volume-row input{
        max-width:none;
      }
    }
  `;
  document.head.appendChild(style);
}

function formatTime(secs) {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function generateBars(count, seed) {
  const bars = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    bars.push(((s / 4294967295) * 70 + 20));
  }
  return bars;
}
const bars = generateBars(140, 42);

function renderWaveform() {
  if (!waveform) return;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  waveform.innerHTML = bars.map((h, i) => {
    const played = (i / bars.length) * 100 <= progress;
    return `<span class="wave-bar ${played ? "played" : ""}" style="height:${h}%"></span>`;
  }).join("") + `<span class="playhead" style="left:${progress}%"></span>`;
}

function updatePlayerProgressOnly() {
  if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
  if (durationEl) durationEl.textContent = formatTime(duration);
  renderWaveform();
}

function renderPlaylistTabs() {
  const tabs = document.querySelector(".playlist-tabs");
  if (!tabs) return;

  const categories = [...new Set(mockSongs.map(song => String(song.category || "").trim()).filter(Boolean))]
    .sort((a, b) => (Number(a) || 0) - (Number(b) || 0));

  tabs.innerHTML = `
    <button class="playlist-tab ${currentProductListy === "all" ? "active" : ""}" data-listy="all">ทั้งหมด</button>
    ${categories.map(category => `
      <button class="playlist-tab ${currentProductListy === category ? "active" : ""}" data-listy="${category}">${category}</button>
    `).join("")}
  `;

  attachPlaylistEvents();
}

function attachPlaylistEvents() {
  document.querySelectorAll(".playlist-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".playlist-tab").forEach(item => item.classList.remove("active"));
      btn.classList.add("active");
      renderProductList(btn.dataset.listy || "all");
    });
  });
}

function renderProductList(listy = "all") {
  const productList = document.getElementById("productList");
  if (!productList) return;

  currentProductListy = listy;

  const filteredSongs = listy === "all"
    ? mockSongs
    : mockSongs.filter(song => String(song.category) === String(listy));

  if (filteredSongs.length === 0) {
    productList.innerHTML = `<div class="card empty-box"><div class="empty-icon">♫</div><p>ยังไม่มีสินค้าในหมวดนี้</p></div>`;
    return;
  }

  productList.innerHTML = filteredSongs.map(song => {
    const active = playingId === `mock-${song.id}`;
    return `
      <article class="product-card">
        <div class="product-row">
          <div class="product-cover">
            ♫
            ${active ? `<div class="bouncing"><span></span><span></span><span></span><span></span><span></span></div>` : ""}
          </div>
          <div class="product-info">
            <h3>${song.title}</h3>
            <p>${song.artist}</p>
            <div class="meta"><span class="category">${song.category}</span><span>${song.duration}</span></div>
          </div>
          <div class="product-actions">
            <span class="price">${song.price} บาท</span>
            <button class="play-btn ${active ? "active" : ""}" onclick="toggleMock(${song.id})">${active ? "❚❚" : "▶"}</button>
            <button class="buy-btn">ซื้อเลย</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderSongs() {
  const songGrid = document.getElementById("songGrid");
  if (songGrid) {
    if (mockSongs.length === 0) {
      songGrid.innerHTML = `
        <div class="card empty-box">
          <div class="empty-icon">♫</div>
          <p>ยังไม่มีเพลงในระบบ หรือกำลังโหลดข้อมูลจาก Supabase</p>
        </div>
      `;
    } else {
      songGrid.innerHTML = mockSongs.map(song => {
        const active = playingId === `mock-${song.id}`;
        return `
          <article class="song-card" style="--i:${song.id}">
            <div class="cover">
              <span class="music-big">♫</span>
              ${active ? `<div class="bouncing"><span></span><span></span><span></span><span></span><span></span></div>` : ""}
            </div>
            <div class="card-body">
              <h3>${song.title}</h3>
              <p>${song.artist}</p>
              <div class="song-bottom">
                <span class="price">${song.price} บาท</span>
                <button class="play-btn ${active ? "active" : ""}" onclick="toggleMock(${song.id})">${active ? "❚❚" : "▶"}</button>
              </div>
            </div>
          </article>`;
      }).join("");
    }
  }

  renderProductList(currentProductListy);
}

function renderFreeSongs() {
  const area = document.getElementById("freeSongsArea");
  if (!area) return;

  if (freeSongs.length === 0) {
    area.innerHTML = `<div class="card empty-box"><div class="empty-icon">♫</div><p>ยังไม่มีเพลงที่อัพโหลด</p></div>`;
    return;
  }

  area.innerHTML = freeSongs.map(song => {
    const active = playingId === `free-${song.id}`;
    return `
      <article class="card free-song">
        <div class="product-row">
          <div class="free-cover">♫</div>
          <div class="product-info">
            <h3>${song.title}</h3>
            <p>${song.fileName}</p>
            <p>อัพโหลดเมื่อ ${song.uploadDate}</p>
          </div>
          <div class="product-actions">
            <button class="play-btn ${active ? "active" : ""}" onclick="toggleFree(${song.id})">${active ? "❚❚" : "▶"}</button>
            <a class="download-btn" href="${song.fileUrl}" download>ดาวน์โหลด</a>
          </div>
        </div>
      </article>`;
  }).join("");
}

async function loadProductsFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from("products")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("โหลดข้อมูลจาก Supabase ไม่ได้:", error);
      const msg = error.message || "Unknown error";
      const errorBox = `
        <div class="card empty-box">
          <div class="empty-icon">⚠️</div>
          <p>โหลดข้อมูลจาก Supabase ไม่ได้</p>
          <p>${msg}</p>
        </div>
      `;
      const songGrid = document.getElementById("songGrid");
      const productList = document.getElementById("productList");
      if (songGrid) songGrid.innerHTML = errorBox;
      if (productList) productList.innerHTML = errorBox;
      alert("โหลดข้อมูลจาก Supabase ไม่ได้: " + msg);
      return;
    }

    let rows = data || [];

    // Fallback: try direct PostgREST when client query returns empty.
    if (!rows.length) {
      const restUrl = `${SUPABASE_URL}/rest/v1/products?select=*&order=id.asc`;
      const restRes = await fetch(restUrl, {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      if (restRes.ok) {
        const restData = await restRes.json();
        if (Array.isArray(restData)) rows = restData;
      } else {
        console.warn("REST fallback failed:", restRes.status, restRes.statusText);
      }
    }

    mockSongs = rows.map(item => ({
      id: item.id,
      title: item.title,
      artist: item.artist || "RAPEEPHAT REMIX",
      price: item.price || 300,
      duration: item.duration || "0:00",
      durationSecs: item.duration_secs || 0,
      category: item.category || "",
      audioUrl: item.audio_url || "",
      coverUrl: item.cover_url || ""
    }));

    if (!mockSongs.length) {
      console.warn("No products loaded. Check products rows, RLS SELECT policy for anon, and SUPABASE keys.");
    }

    renderPlaylistTabs();
    renderSongs();
    renderFreeSongs();
    renderWaveform();
  } catch (err) {
    console.error("ติดต่อ Supabase ไม่ได้:", err);
    const msg = err.message || "Unknown error";
    const errorBox = `
      <div class="card empty-box">
        <div class="empty-icon">⚠️</div>
        <p>ติดต่อ Supabase ไม่ได้</p>
        <p>${msg}</p>
      </div>
    `;
    const songGrid = document.getElementById("songGrid");
    const productList = document.getElementById("productList");
    if (songGrid) songGrid.innerHTML = errorBox;
    if (productList) productList.innerHTML = errorBox;
    alert("ติดต่อ Supabase ไม่ได้: " + msg);
  }
}

function updatePlayer() {
  const isPlaying = playingId !== null;
  if (player) player.classList.toggle("hidden", !isPlaying);
  document.body.classList.toggle("has-player", isPlaying);
  if (playerTitleEl) playerTitleEl.textContent = playerTitle;
  if (playerArtistEl) playerArtistEl.textContent = playerArtist;
  updatePlayerProgressOnly();
  renderSongs();
  renderFreeSongs();
}

function stopMockTimer() {
  if (mockTimer) clearInterval(mockTimer);
  mockTimer = null;
  lastMockTick = 0;
}

function stopProgressLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function getCurrentSupabaseSong() {
  if (!playingId || !playingId.startsWith("mock-")) return null;
  const id = Number(playingId.replace("mock-", ""));
  return mockSongs.find(song => Number(song.id) === id) || null;
}

function startProgressLoop() {
  stopProgressLoop();

  const loop = (timestamp) => {
    if (!playingId) {
      stopProgressLoop();
      return;
    }

    const currentSong = getCurrentSupabaseSong();

    if (playingId.startsWith("mock-") && currentSong?.audioUrl && audio.src) {
      if (!isSeeking) {
        currentTime = audio.currentTime || 0;
        if (audio.duration && !isNaN(audio.duration)) duration = audio.duration;
      }
    } else if (playingId.startsWith("mock-")) {
      if (!lastMockTick) lastMockTick = timestamp;
      const diff = (timestamp - lastMockTick) / 1000;
      lastMockTick = timestamp;

      if (!isSeeking) {
        currentTime += diff;
      }

      if (currentTime >= duration && duration > 0) {
        currentTime = duration;
        playingId = null;
        stopProgressLoop();
        updatePlayer();
        return;
      }
    } else if (playingId.startsWith("free-") && !isSeeking) {
      currentTime = audio.currentTime || 0;
      if (audio.duration && !isNaN(audio.duration)) duration = audio.duration;
    }

    updatePlayerProgressOnly();
    rafId = requestAnimationFrame(loop);
  };

  rafId = requestAnimationFrame(loop);
}

function seekToPercent(percent) {
  if (!playingId || !duration) return;

  const pct = Math.max(0, Math.min(1, percent));
  currentTime = pct * duration;

  if (audio.src && audio.duration && !isNaN(audio.duration)) {
    audio.currentTime = currentTime;
  }

  updatePlayerProgressOnly();
}

function toggleMock(id) {
  const song = mockSongs.find(s => Number(s.id) === Number(id));
  if (!song) return;

  const thisPlayingId = `mock-${song.id}`;

  if (playingId === thisPlayingId) {
    audio.pause();
    stopMockTimer();
    stopProgressLoop();
    playingId = null;
    updatePlayer();
    return;
  }

  stopMockTimer();
  stopProgressLoop();
  audio.pause();

  playingId = thisPlayingId;
  playerTitle = song.title;
  playerArtist = song.artist;
  currentTime = 0;
  duration = song.durationSecs || 0;

  if (song.audioUrl) {
    audio.src = song.audioUrl;
    audio.volume = volume / 100;
    audio.play().catch(err => {
      console.error("เล่นเพลงไม่ได้:", err);
      alert("เล่นเพลงไม่ได้ ลองเช็กช่อง audio_url ว่าเป็นลิงก์ MP3 ตรงหรือเปล่า");
    });
  } else {
    audio.removeAttribute("src");
    audio.load();
  }

  updatePlayer();
  startProgressLoop();
}

function toggleFree(id) {
  const song = freeSongs.find(s => s.id === id);
  if (!song) return;

  const thisPlayingId = `free-${song.id}`;

  if (playingId === thisPlayingId) {
    audio.pause();
    stopProgressLoop();
    playingId = null;
    updatePlayer();
    return;
  }

  stopMockTimer();
  stopProgressLoop();

  playingId = thisPlayingId;
  playerTitle = song.title;
  playerArtist = song.artist;
  currentTime = 0;
  duration = 0;
  audio.src = song.fileUrl;
  audio.volume = volume / 100;
  audio.play().catch(err => {
    console.error("เล่นไฟล์อัพโหลดไม่ได้:", err);
    alert("เล่นไฟล์อัพโหลดไม่ได้");
  });

  updatePlayer();
  startProgressLoop();
}

function addGithubUrl() {
  const input = document.getElementById("githubUrl");
  const error = document.getElementById("githubError");
  if (!input || !error) return;

  let url = input.value.trim();
  if (!url) {
    error.textContent = "กรุณาใส่ลิงก์ก่อน";
    return;
  }

  url = url.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/");

  if (!url.match(/\.(mp3|wav|ogg|flac|aac)$/i)) {
    error.textContent = "ลิงก์ต้องเป็นไฟล์เสียง (.mp3, .wav ฯลฯ)";
    return;
  }

  error.textContent = "";
  const fileName = url.split("/").pop() || "github-track";

  freeSongs.push({
    id: Date.now(),
    title: fileName.replace(/\.(mp3|wav|ogg|flac|aac)$/i, ""),
    artist: "GitHub",
    fileName,
    uploadDate: new Date().toLocaleDateString("th-TH"),
    fileUrl: url
  });

  input.value = "";
  renderFreeSongs();
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const page = document.getElementById(btn.dataset.page);
    if (!page) {
      console.warn("ไม่พบหน้า:", btn.dataset.page);
      return;
    }

    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    page.classList.add("active");
  });
});

const addGithubBtn = document.getElementById("addGithubBtn");
if (addGithubBtn) addGithubBtn.addEventListener("click", addGithubUrl);

const githubUrl = document.getElementById("githubUrl");
if (githubUrl) githubUrl.addEventListener("keydown", e => { if (e.key === "Enter") addGithubUrl(); });

const uploadBtn = document.getElementById("uploadBtn");
const fileInput = document.getElementById("fileInput");

if (uploadBtn && fileInput) {
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.match(/\.(mp3|wav)$/i)) {
      alert("กรุณาอัพโหลดไฟล์ .mp3 หรือ .wav เท่านั้น");
      return;
    }

    freeSongs.push({
      id: Date.now(),
      title: file.name.replace(/\.(mp3|wav)$/i, ""),
      artist: "ของฉัน",
      fileName: file.name,
      uploadDate: new Date().toLocaleDateString("th-TH"),
      fileUrl: URL.createObjectURL(file)
    });

    renderFreeSongs();
  });
}

const pauseBtn = document.getElementById("pauseBtn");
if (pauseBtn) {
  pauseBtn.addEventListener("click", () => {
    if (!playingId) return;
    audio.pause();
    stopMockTimer();
    stopProgressLoop();
    playingId = null;
    updatePlayer();
  });
}

if (rewindBtn) {
  rewindBtn.addEventListener("click", () => {
    if (!playingId) return;

    if (audio.src && audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = Math.max(audio.currentTime - 15, 0);
      currentTime = audio.currentTime;
    } else {
      currentTime = Math.max(currentTime - 15, 0);
    }

    updatePlayerProgressOnly();
  });
}

if (skipBtn) {
  skipBtn.addEventListener("click", () => {
    if (!playingId) return;

    if (audio.src && audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = Math.min(audio.currentTime + 15, audio.duration);
      currentTime = audio.currentTime;
    } else {
      currentTime = Math.min(currentTime + 15, duration);
    }

    updatePlayerProgressOnly();
  });
}

function seekFromEvent(e) {
  if (!playingId || !duration || !waveform) return;
  const rect = waveform.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  seekToPercent((clientX - rect.left) / rect.width);
}

if (waveform) {
  waveform.addEventListener("pointerdown", e => {
    if (!playingId || !duration) return;
    isSeeking = true;
    waveform.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });

  waveform.addEventListener("pointermove", e => {
    if (!isSeeking) return;
    seekFromEvent(e);
  });

  waveform.addEventListener("pointerup", e => {
    if (!isSeeking) return;
    seekFromEvent(e);
    isSeeking = false;
  });

  waveform.addEventListener("pointercancel", () => {
    isSeeking = false;
  });
}

if (volumeEl) {
  volumeEl.addEventListener("input", e => {
    volume = parseInt(e.target.value, 10);
    audio.volume = volume / 100;
    if (volumeText) volumeText.textContent = volume + "%";
  });
}

audio.addEventListener("timeupdate", () => {
  if (!playingId) return;
  currentTime = audio.currentTime || 0;
  updatePlayerProgressOnly();
});

audio.addEventListener("loadedmetadata", () => {
  if (audio.duration && !isNaN(audio.duration)) {
    duration = audio.duration;
  }
  updatePlayer();
});

audio.addEventListener("ended", () => {
  playingId = null;
  currentTime = 0;
  stopProgressLoop();
  updatePlayer();
});

/* HOME 3D MOUSE EFFECT */
function initHomeCardEffects() {
  document.querySelectorAll("#home .song-card").forEach(card => {
    card.addEventListener("mousemove", e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const midX = rect.width / 2;
      const midY = rect.height / 2;
      const rotateY = ((x - midX) / midX) * 8;
      const rotateX = -((y - midY) / midY) * 8;
      card.style.setProperty("--mx", `${(x / rect.width) * 100}%`);
      card.style.setProperty("--my", `${(y / rect.height) * 100}%`);
      card.style.transform = `translateY(-10px) scale(1.03) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    });

    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

const oldRenderSongs = renderSongs;
renderSongs = function() {
  oldRenderSongs();
  initHomeCardEffects();
};

renderSongs();
loadProductsFromSupabase();

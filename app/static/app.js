const state = {
  user: null,
  downloads: [],
  users: [],
  systemInfo: null,
  poller: null,
};

const THEME_KEY = "pullora-theme";
const MODE_KEY = "pullora-mode";
const LEGACY_THEME_KEY = "ytdlp-client-theme";
const LEGACY_MODE_KEY = "ytdlp-client-mode";
const systemScheme = window.matchMedia("(prefers-color-scheme: dark)");

const compatibleVideoCodecs = {
  auto: ["auto", "h264", "h265", "av1", "vp9"],
  mp4: ["auto", "h264", "h265", "av1"],
  webm: ["auto", "vp9", "av1"],
  mkv: ["auto", "h264", "h265", "av1", "vp9"],
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function migrateThemeStorage() {
  if (!localStorage.getItem(THEME_KEY) && localStorage.getItem(LEGACY_THEME_KEY)) {
    localStorage.setItem(THEME_KEY, localStorage.getItem(LEGACY_THEME_KEY));
  }
  if (!localStorage.getItem(MODE_KEY) && localStorage.getItem(LEGACY_MODE_KEY)) {
    localStorage.setItem(MODE_KEY, localStorage.getItem(LEGACY_MODE_KEY));
  }
}

function savedTheme() {
  return localStorage.getItem(THEME_KEY) || "lavender";
}

function savedMode() {
  return localStorage.getItem(MODE_KEY) || "system";
}

function resolvedMode(mode = savedMode()) {
  return mode === "system" ? (systemScheme.matches ? "dark" : "light") : mode;
}

function applyTheme() {
  const theme = savedTheme();
  const mode = savedMode();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.mode = resolvedMode(mode);
  $("#themeSelect").value = theme;
  $("#modeSelect").value = mode;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(bytes);
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.detail || "Request failed");
  }
  return payload;
}

function selectedMediaType() {
  return new FormData($("#downloadForm")).get("media_type") || "video";
}

function settingsLabel(settings = {}) {
  const type = settings.media_type || "video";
  if (type === "audio") {
    const label = ["Audio", settings.audio_format, settings.audio_bitrate]
      .filter((value) => value && value !== "auto")
      .join(" ");
    return label === "Audio" ? "Audio Auto" : label || "Audio Auto";
  }
  const label = [
    "Video",
    settings.video_format,
    settings.video_codec,
    settings.video_quality && settings.video_quality !== "auto" ? `${settings.video_quality}p` : null,
  ]
    .filter((value) => value && value !== "auto")
    .join(" ");
  return label === "Video" ? "Video Auto" : label || "Video Auto";
}

function downloadSettingsSummary() {
  const form = new FormData($("#downloadForm"));
  const type = form.get("media_type") || "video";
  const playlist = form.get("playlist") === "on" ? "Playlist on" : "Playlist off";
  if (type === "audio") {
    return [
      "Audio",
      form.get("audio_format") === "auto" ? "Auto format" : String(form.get("audio_format")).toUpperCase(),
      ["flac", "wav"].includes(form.get("audio_format")) || form.get("audio_bitrate") === "auto"
        ? "Auto bitrate"
        : form.get("audio_bitrate"),
      playlist,
    ];
  }
  return [
    "Video",
    form.get("video_format") === "auto" ? "Auto format" : String(form.get("video_format")).toUpperCase(),
    form.get("video_codec") === "auto" ? "Auto codec" : String(form.get("video_codec")).toUpperCase(),
    playlist,
  ];
}

function renderOptionsSummary() {
  $("#optionsSummary").innerHTML = downloadSettingsSummary()
    .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
    .join("");
}

function updateVideoCodecOptions() {
  const format = $("#videoFormat").value;
  const codec = $("#videoCodec");
  const allowed = compatibleVideoCodecs[format] || compatibleVideoCodecs.auto;
  Array.from(codec.options).forEach((option) => {
    option.disabled = !allowed.includes(option.value);
  });
  if (!allowed.includes(codec.value)) {
    codec.value = "auto";
  }
}

function updateAudioBitrateState() {
  const format = $("#audioFormat").value;
  const bitrate = $("#audioBitrate");
  const isLossless = ["flac", "wav"].includes(format);
  bitrate.disabled = isLossless;
  if (isLossless) {
    bitrate.value = "auto";
  }
}

function updateDownloadOptions() {
  const type = selectedMediaType();
  $$("[data-setting-group]").forEach((element) => {
    element.hidden = element.dataset.settingGroup !== type;
  });
  updateVideoCodecOptions();
  updateAudioBitrateState();
  renderOptionsSummary();
}

function setOptionsOpen(open) {
  $("#downloadOptionsPanel").hidden = !open;
  $("#optionsToggle").setAttribute("aria-expanded", String(open));
}

function resetDownloadOptions() {
  $("#downloadForm").reset();
  setOptionsOpen(false);
  updateDownloadOptions();
}

function showLogin() {
  $("#loginView").hidden = false;
  $("#appView").hidden = true;
  $("#userMenu").hidden = true;
  if (state.poller) clearInterval(state.poller);
}

function showApp() {
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  $("#currentUser").textContent = state.user?.username || "";
  $("#userMenuTitle").textContent = state.user?.username || "Pullora";
  $("#adminTools").hidden = !state.user?.is_admin;
}

async function loadSystemInfo() {
  state.systemInfo = await api("/api/health");
  renderAboutInfo();
}

function renderAboutInfo() {
  const payload = state.systemInfo || {};
  const shortSha = payload.build_sha ? payload.build_sha.slice(0, 12) : "dev";
  const rows = [
    ["App Name", "Pullora"],
    ["Pullora version", payload.version || "0.1.0"],
    ["GitHub SHA", shortSha],
    ["Build date", payload.build_date || "unknown"],
    ["yt-dlp version", payload.yt_dlp_version || "unknown"],
    ["Public IP", payload.public_ip || "unavailable"],
    ["Impersonation", payload.curl_cffi_available ? "available" : "missing"],
    ["Deno", payload.deno_version || "unavailable"],
    ["yt-dlp-ejs", payload.yt_dlp_ejs_version || "unavailable"],
    ["ffmpeg", payload.ffmpeg_version || "unavailable"],
    ["Server", payload.status || "unknown"],
    ["Diagnostics", "No client-side errors recorded"],
    ["Logs", "Server logs are available through Docker"],
  ];
  $("#aboutInfo").innerHTML = rows
    .map(([label, value]) => `<div class="about-row"><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`)
    .join("");
}

async function refreshAll() {
  if (!state.user) return;
  await Promise.all([loadDownloads(), state.user.is_admin ? loadUsers() : Promise.resolve()]);
}

async function loadDownloads() {
  const payload = await api("/api/downloads");
  state.downloads = payload.downloads;
  renderDownloads();
}

async function loadUsers() {
  const payload = await api("/api/admin/users");
  state.users = payload.users;
  renderUsers();
}

function renderQueueStats() {
  const counts = state.downloads.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { running: 0, queued: 0, completed: 0, failed: 0 },
  );
  $("#queueStats").innerHTML = [
    `Active ${counts.running || 0}`,
    `Queued ${counts.queued || 0}`,
    `Completed ${counts.completed || 0}`,
    `Failed ${counts.failed || 0}`,
  ]
    .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
    .join("");
}

function renderDownloads() {
  const target = $("#downloadList");
  renderQueueStats();
  if (!state.downloads.length) {
    target.innerHTML = '<div class="empty-state">No downloads</div>';
    return;
  }

  target.innerHTML = state.downloads
    .map((item) => {
      const title = item.title || item.url;
      const canCancel = ["queued", "running"].includes(item.status);
      const canDelete = item.status !== "running";
      const progress = Math.max(0, Math.min(100, item.progress || 0));
      const size = formatBytes(item.file_size);
      const detail = [settingsLabel(item.settings), size, item.speed, item.eta ? `ETA ${item.eta}` : null, formatDate(item.created_at)]
        .filter(Boolean)
        .join(" - ");
      return `
        <article class="download-card ${escapeHtml(item.status)}">
          <div class="download-top">
            <div>
              <div class="download-title">${escapeHtml(title)}</div>
              <div class="meta">${escapeHtml(detail || item.url)}</div>
            </div>
            <span class="status-chip ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
          </div>
          <div class="progress-track"><div class="progress-bar" data-progress="${progress}"></div></div>
          ${item.error ? `<div class="meta">${escapeHtml(item.error)}</div>` : ""}
          <div class="card-actions">
            ${
              item.file_url
                ? `<a class="icon-button" href="${escapeHtml(item.file_url)}" title="Download file" aria-label="Download file">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3v11"></path>
                      <path d="m7 9 5 5 5-5"></path>
                      <path d="M5 20h14"></path>
                    </svg>
                  </a>`
                : ""
            }
            ${canCancel ? `<button class="button tonal" type="button" data-action="cancel" data-id="${item.id}">Stop</button>` : ""}
            ${canDelete ? `<button class="button text" type="button" data-action="delete" data-id="${item.id}">Remove</button>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  $$(".progress-bar").forEach((bar) => {
    bar.style.width = `${bar.dataset.progress}%`;
  });
}

function renderUsers() {
  const target = $("#userList");
  target.innerHTML = state.users
    .map(
      (user) => `
        <div class="user-row">
          <div class="row-top">
            <div>
              <div class="user-name">${escapeHtml(user.username)}</div>
              <div class="meta">${user.is_admin ? "Admin" : "User"} - ${escapeHtml(formatDate(user.created_at))}</div>
            </div>
          </div>
          <div class="user-actions">
            <button class="button text" type="button" data-user-action="password" data-id="${user.id}">Password</button>
            ${
              user.id !== state.user.id
                ? `<button class="button text" type="button" data-user-action="delete" data-id="${user.id}">Delete</button>`
                : ""
            }
          </div>
        </div>
      `,
    )
    .join("");
}

function openUserMenu() {
  $("#userMenu").hidden = false;
  $("#userMenuButton").setAttribute("aria-expanded", "true");
  loadSystemInfo().catch(() => renderAboutInfo());
}

function closeUserMenu() {
  $("#userMenu").hidden = true;
  $("#userMenuButton").setAttribute("aria-expanded", "false");
}

async function boot() {
  migrateThemeStorage();
  applyTheme();
  updateDownloadOptions();
  try {
    const payload = await api("/api/me");
    state.user = payload.user;
    showApp();
    await Promise.all([refreshAll(), loadSystemInfo()]);
    state.poller = setInterval(refreshAll, 2500);
  } catch {
    showLogin();
  }
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginForm = event.currentTarget;
  $("#loginError").textContent = "";
  const form = new FormData(loginForm);
  try {
    const payload = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });
    state.user = payload.user;
    loginForm?.reset();
    showApp();
    await Promise.all([refreshAll(), loadSystemInfo()]);
    state.poller = setInterval(refreshAll, 2500);
  } catch (error) {
    $("#loginError").textContent = error.message;
  }
});

$("#logoutButton").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  state.user = null;
  showLogin();
});

$("#downloadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const downloadForm = event.currentTarget;
  $("#downloadError").textContent = "";
  const form = new FormData(downloadForm);
  try {
    await api("/api/downloads", {
      method: "POST",
      body: JSON.stringify({
        url: form.get("url"),
        media_type: form.get("media_type") || "video",
        video_format: form.get("video_format") || "auto",
        video_codec: form.get("video_codec") || "auto",
        video_quality: form.get("video_quality") || "auto",
        audio_format: form.get("audio_format") || "auto",
        audio_bitrate: form.get("audio_bitrate") || "auto",
        playlist: form.get("playlist") === "on",
      }),
    });
    downloadForm?.reset();
    setOptionsOpen(false);
    updateDownloadOptions();
    await loadDownloads();
  } catch (error) {
    $("#downloadError").textContent = error.message;
  }
});

$("#downloadList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  button.disabled = true;
  try {
    if (button.dataset.action === "cancel") {
      await api(`/api/downloads/${id}/cancel`, { method: "POST" });
    } else if (button.dataset.action === "delete") {
      await api(`/api/downloads/${id}`, { method: "DELETE" });
    }
    await loadDownloads();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

$("#optionsToggle").addEventListener("click", () => {
  setOptionsOpen($("#downloadOptionsPanel").hidden);
});
$("#optionsReset").addEventListener("click", resetDownloadOptions);
$("#optionsDone").addEventListener("click", () => setOptionsOpen(false));
$("#videoFormat").addEventListener("change", updateDownloadOptions);
$("#videoCodec").addEventListener("change", renderOptionsSummary);
$("#audioFormat").addEventListener("change", updateDownloadOptions);
$("#audioBitrate").addEventListener("change", renderOptionsSummary);
$$("input[name='media_type']").forEach((input) => input.addEventListener("change", updateDownloadOptions));
$("#downloadForm").addEventListener("change", renderOptionsSummary);
$("#refreshButton").addEventListener("click", loadDownloads);

$("#userMenuButton").addEventListener("click", openUserMenu);
$("#userMenuClose").addEventListener("click", closeUserMenu);
$("#userMenu").addEventListener("click", (event) => {
  if (event.target.matches("[data-menu-close]")) {
    closeUserMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#userMenu").hidden) {
    closeUserMenu();
  }
});

$("#themeSelect").addEventListener("change", (event) => {
  localStorage.setItem(THEME_KEY, event.target.value);
  applyTheme();
});
$("#modeSelect").addEventListener("change", (event) => {
  localStorage.setItem(MODE_KEY, event.target.value);
  applyTheme();
});
systemScheme.addEventListener("change", () => {
  if (savedMode() === "system") applyTheme();
});

$("#copyDebugButton").addEventListener("click", async () => {
  const payload = JSON.stringify(state.systemInfo || {}, null, 2);
  await navigator.clipboard.writeText(payload);
});

$("#userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const userForm = event.currentTarget;
  $("#userError").textContent = "";
  const form = new FormData(userForm);
  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
        is_admin: form.get("is_admin") === "on",
      }),
    });
    userForm?.reset();
    await loadUsers();
  } catch (error) {
    $("#userError").textContent = error.message;
  }
});

$("#userList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-user-action]");
  if (!button) return;
  const id = button.dataset.id;
  button.disabled = true;
  try {
    if (button.dataset.userAction === "delete") {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
    } else if (button.dataset.userAction === "password") {
      const password = prompt("New password");
      if (!password) return;
      await api(`/api/admin/users/${id}/password`, {
        method: "PUT",
        body: JSON.stringify({ password }),
      });
    }
    await loadUsers();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

boot();

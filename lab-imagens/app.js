// Lab de Imagens — front
// Fase 1: prompt · Fase 3: refino por upload. Estático, sem build.

// ── CONFIG ────────────────────────────────────────────────────────
const CLIENT_ID = "701803669649-3shfr7fv229i9o3l0aonp8mfbiphpfe9.apps.googleusercontent.com";
const FUNCTION_URL = "https://us-central1-selvia-lab-imagens.cloudfunctions.net/gerar-imagem";
const MAX_FILE_MB = 20;   // limite do arquivo escolhido
const MAX_EDGE = 1536;    // redimensiona no navegador antes de enviar
// ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
let idToken = null;
let mode = "prompt";
let selectedFile = null;
let originFileId = null;   // reuso do original já salvo no Drive (mesma imagem)
let originLink = null;

// ── Login ─────────────────────────────────────────────────────────
function handleCredentialResponse(resp) {
  idToken = resp.credential;
  let email = "";
  try { email = JSON.parse(atob(idToken.split(".")[1])).email || ""; } catch (_) {}
  $("user-email").textContent = email;
  $("view-login").hidden = true;
  $("view-app").hidden = false;
}

window.onload = () => {
  if (window.google) {
    google.accounts.id.initialize({ client_id: CLIENT_ID, callback: handleCredentialResponse });
    google.accounts.id.renderButton($("gbtn"), { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill" });
  }
};

function relogin() {
  idToken = null;
  $("view-app").hidden = true;
  $("view-login").hidden = false;
  if (window.google) google.accounts.id.prompt();
}

// ── Tabs (modo) ───────────────────────────────────────────────────
function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.mode === next));
  $("uploadBlock").hidden = next !== "refino";
  $("promptLabel").textContent = next === "refino"
    ? "O que mudar nessa imagem? (o resto é preservado)"
    : "Descreva a imagem que você quer gerar";
  $("prompt").placeholder = next === "refino"
    ? "Ex.: mantenha o layout e a identidade; só deixe o fundo mais limpo, aumente o contraste e melhore a nitidez"
    : "Ex.: banner clean para médicos, tons de verde, com um celular mostrando o WhatsApp da Selvia";
  $("refinoHint").hidden = next !== "refino";
}

// ── Upload + preview ──────────────────────────────────────────────
function onFile(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return setStatus("Selecione um arquivo de imagem.", "err");
  if (file.size > MAX_FILE_MB * 1024 * 1024) return setStatus(`Imagem muito grande (máx ${MAX_FILE_MB} MB).`, "err");
  selectedFile = file;
  originFileId = null;   // imagem nova -> salva de novo na próxima geração
  originLink = null;
  const url = URL.createObjectURL(file);
  $("thumb").src = url;
  $("thumb").hidden = false;
  $("dropEmpty").hidden = true;
  setStatus("");
}

// redimensiona no navegador -> { base64, mime } (payload menor/mais rápido)
function resizeToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
      const dataUrl = c.toDataURL(mime, 0.92);
      URL.revokeObjectURL(url);
      resolve({ base64: dataUrl.split(",")[1], mime });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Falha ao ler a imagem")); };
    img.src = url;
  });
}

// ── Gerar ─────────────────────────────────────────────────────────
function setStatus(msg, kind) {
  const el = $("status");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

async function gerar() {
  const prompt = $("prompt").value.trim();
  if (!prompt) return setStatus("Escreva o que você quer.", "err");
  if (mode === "refino" && !selectedFile) return setStatus("Suba uma imagem para refinar.", "err");
  if (!idToken) return relogin();

  $("gerar").disabled = true;
  $("result").hidden = true;
  setStatus(mode === "refino" ? "Refinando sua imagem…" : "Gerando… (alguns segundos)", "loading");

  try {
    const payload = { mode, prompt };
    if (mode === "refino") {
      const { base64, mime } = await resizeToBase64(selectedFile);
      payload.imageBase64 = base64;
      payload.imageMime = mime;
      if (originFileId) { payload.originFileId = originFileId; payload.originLink = originLink; }
    }

    const r = await fetch(FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));

    if (r.status === 401) { setStatus("Sessão expirada — faça login de novo.", "err"); return relogin(); }
    if (!r.ok) throw new Error(data.error || ("Erro " + r.status));

    if (data.originFileId) { originFileId = data.originFileId; originLink = data.originLink; }
    const src = `data:${data.mime || "image/png"};base64,${data.imageBase64}`;
    $("preview").src = src;
    $("download").href = src;
    if (data.driveLink) $("drive").href = data.driveLink;
    $("result").hidden = false;
    setStatus("");
  } catch (e) {
    setStatus(e.message || "Falha ao gerar.", "err");
  } finally {
    $("gerar").disabled = false;
  }
}

// ── Eventos ───────────────────────────────────────────────────────
document.addEventListener("click", (e) => {
  if (e.target.classList?.contains("tab")) setMode(e.target.dataset.mode);
  if (e.target.id === "gerar") gerar();
  if (e.target.id === "logout") relogin();
});
$("file").addEventListener("change", (e) => onFile(e.target.files[0]));

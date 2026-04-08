const API_BASE_URL = "COLE_AQUI_A_URL_DO_SEU_BACKEND";
const API_KEY = ""; // deixe vazio se não usar

let ultimo = null;
let dados = null;
let placaStatus = null;
let veiculoStatus = null;
let markedActive = false;
let liberado = false;

let html5QrCode = null;
let cameraRunning = false;
let camerasList = [];
let currentCameraIndex = 0;
let lastScanAt = 0;

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E
];

function $(id) {
  return document.getElementById(id);
}

function debugLog(message, type = "info", obj = null) {
  const log = $("debug-log");
  const line = document.createElement("div");
  line.className = "debug-line debug-" + type;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  let text = `[${hh}:${mm}:${ss}] ${message}`;
  if (obj) {
    try { text += " | " + JSON.stringify(obj); } catch (_) {}
  }

  line.textContent = text;
  log.prepend(line);
  console.log(message, obj || "");
}

function setMsg(texto, tipo = "") {
  const el = $("msg");
  el.className = tipo;
  el.innerHTML = texto;
}

function hideAllOptions() {
  $("opcao-liberar").style.display = "none";
  $("opcoes-spx").style.display = "none";
  $("opcoes-placa").style.display = "none";
  $("opcoes-veiculo").style.display = "none";
}

function toggleAjudaPermissao() {
  const el = $("ajuda-permissao");
  el.style.display = el.style.display === "flex" ? "none" : "flex";
}

function validarAmbienteCamera() {
  if (location.protocol !== "https:") {
    return "A câmera só funciona em HTTPS.";
  }

  if (!window.isSecureContext) {
    return "Conflito de contexto seguro.";
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "Este navegador não liberou acesso à câmera.";
  }

  return "";
}

function ensureScannerInstance() {
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
    debugLog("Instância Html5Qrcode criada", "ok");
  }
}

async function carregarListaCameras() {
  const cams = await Html5Qrcode.getCameras();
  camerasList = Array.isArray(cams) ? cams : [];
  debugLog("Câmeras detectadas", "info", camerasList.map(c => ({ id: c.id, label: c.label })));
  return camerasList;
}

async function testarPermissao() {
  try {
    const erroAmbiente = validarAmbienteCamera();
    if (erroAmbiente) {
      setMsg(erroAmbiente, "msg-erro");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(t => t.stop());
    setMsg("Permissão de câmera OK.", "msg-ok");
    debugLog("Permissão de câmera OK", "ok");
  } catch (err) {
    tratarErroCamera(err);
  }
}

function getScannerConfig() {
  return {
    fps: 10,
    qrbox: (viewfinderWidth, viewfinderHeight) => {
      const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
      const qrboxSize = Math.floor(minEdge * 0.7);
      return { width: qrboxSize, height: qrboxSize };
    },
    aspectRatio: 1.7778,
    rememberLastUsedCamera: true,
    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
    formatsToSupport: SUPPORTED_FORMATS
  };
}

async function startWithStrategy(strategyName, cameraConfig) {
  debugLog(`Tentando estratégia: ${strategyName}`, "info", cameraConfig);
  ensureScannerInstance();

  await html5QrCode.start(
    cameraConfig,
    getScannerConfig(),
    scanOK,
    onScanFailure
  );

  cameraRunning = true;
  debugLog(`Estratégia OK: ${strategyName}`, "ok");
}

async function iniciarCamera() {
  try {
    if (cameraRunning) {
      setMsg("A câmera já está em execução.");
      return;
    }

    const erroAmbiente = validarAmbienteCamera();
    if (erroAmbiente) {
      setMsg(erroAmbiente, "msg-erro");
      return;
    }

    setMsg("Solicitando permissão da câmera...");

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach(t => t.stop());

    await carregarListaCameras();

    if (!camerasList.length) {
      throw new Error("Nenhuma câmera disponível.");
    }

    let started = false;

    try {
      await startWithStrategy("facingMode environment exact", {
        facingMode: { exact: "environment" }
      });
      started = true;
    } catch (_) {}

    if (!started) {
      try {
        await startWithStrategy("deviceId específico", {
          deviceId: { exact: camerasList[currentCameraIndex].id }
        });
        started = true;
      } catch (_) {}
    }

    if (!started) {
      try {
        await startWithStrategy("facingMode user", {
          facingMode: "user"
        });
        started = true;
      } catch (_) {}
    }

    if (!started) {
      throw new Error("Nenhuma estratégia conseguiu iniciar a câmera.");
    }

    setMsg("Câmera iniciada. Aponte para o QR Code.", "msg-ok");
  } catch (err) {
    tratarErroCamera(err);
  }
}

async function pararCamera() {
  try {
    if (html5QrCode && cameraRunning) {
      await html5QrCode.stop();
      await html5QrCode.clear();
    }
  } catch (_) {
  } finally {
    cameraRunning = false;
    setMsg("Câmera parada.");
  }
}

async function trocarCamera() {
  try {
    if (!camerasList.length) {
      await carregarListaCameras();
    }

    if (camerasList.length < 2) {
      setMsg("Somente uma câmera disponível.");
      return;
    }

    currentCameraIndex = (currentCameraIndex + 1) % camerasList.length;

    if (cameraRunning) {
      await pararCamera();
    }

    await startWithStrategy("troca manual", {
      deviceId: { exact: camerasList[currentCameraIndex].id }
    });

    setMsg("Câmera trocada com sucesso.", "msg-ok");
  } catch (err) {
    tratarErroCamera(err);
  }
}

function tratarErroCamera(err) {
  const raw = String(err && err.message ? err.message : err || "");
  const lower = raw.toLowerCase();

  let msg = "Não foi possível abrir a câmera.";

  if (
    lower.includes("notallowederror") ||
    lower.includes("permission") ||
    lower.includes("denied")
  ) {
    msg = "Permissão da câmera negada.";
    $("ajuda-permissao").style.display = "flex";
  } else if (lower.includes("notfounderror")) {
    msg = "Nenhuma câmera foi encontrada.";
  } else if (lower.includes("notreadableerror")) {
    msg = "A câmera está sendo usada por outro aplicativo.";
  } else {
    msg = "Erro ao abrir câmera: " + raw;
  }

  setMsg(msg, "msg-erro");
  debugLog("Erro câmera", "error", { raw });
}

function onScanFailure() {}

async function apiPost(action, payload = {}) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { "x-api-key": API_KEY } : {})
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const data = await response.json();
  return data;
}

async function seguirFluxoNormal() {
  setMsg("Buscando dados...");
  hideAllOptions();

  try {
    const r = await apiPost("getPlaca", { driverId: ultimo });

    if (!r || !r.ok) {
      setMsg("Erro: " + (r ? r.error : ""), "msg-erro");
      return;
    }

    dados = r;
    $("res-nome").textContent = r.nome || "–";
    $("res-placa").textContent = r.placa || "–";
    $("res-tipo").textContent = r.tipo || "–";
    $("res-spx").textContent = r.spx_status || "–";
    $("res-change").textContent = "–";

    const spx = (r.spx_status || "").trim();

    if (spx && spx !== "Active") {
      $("opcoes-spx").style.display = "flex";
      setMsg("SPX status diferente de Active. Selecione: Active ou Divergência.");
      return;
    }

    $("opcoes-placa").style.display = "flex";
    setMsg("Confirme a placa.");
  } catch (err) {
    setMsg("Erro de comunicação com backend.", "msg-erro");
    debugLog("Erro getPlaca", "error", err);
  }
}

async function scanOK(texto) {
  const agora = Date.now();

  if (!texto) return;
  if (ultimo === texto && (agora - lastScanAt) < 3000) return;

  lastScanAt = agora;
  ultimo = texto;
  dados = null;
  placaStatus = null;
  veiculoStatus = null;
  markedActive = false;
  liberado = false;

  $("res-id").textContent = texto;
  $("res-nome").textContent = "–";
  $("res-placa").textContent = "–";
  $("res-tipo").textContent = "–";
  $("res-spx").textContent = "–";
  $("res-change").textContent = "–";

  hideAllOptions();
  setMsg("Verificando Check-in...");

  try {
    const r = await apiPost("checkCheckin", { driverId: texto });

    if (!r || !r.ok) {
      setMsg("Erro: " + (r ? r.error : ""), "msg-erro");
      return;
    }

    if (r.hasCheckin !== true) {
      setMsg("Check in não foi realizado. Clique em LIBERAR para continuar.", "msg-erro");
      $("opcao-liberar").style.display = "flex";
      return;
    }

    await seguirFluxoNormal();
  } catch (err) {
    setMsg("Erro de comunicação com backend.", "msg-erro");
    debugLog("Erro checkCheckin", "error", err);
  }
}

function liberar() {
  if (!ultimo) return;
  liberado = true;
  seguirFluxoNormal();
}

async function confirmarSPX(opcao) {
  if (!dados || !ultimo) return;

  if (opcao === "DIVERGENCIA") {
    const payload = {
      codigo: ultimo,
      placa: dados.placa,
      placaStatus: "",
      tipoVeiculo: dados.tipo,
      veiculoStatus: "",
      spx_status: dados.spx_status || "",
      markedActive: false
    };

    setMsg("Registrando como Divergente...");
    hideAllOptions();

    const r = await apiPost("saveDivergente", payload);

    if (!r || !r.ok) {
      setMsg("Erro ao registrar Divergente: " + (r ? r.error : ""), "msg-erro");
      return;
    }

    setMsg("✓ Registrado como Divergente!", "msg-ok");
    setTimeout(resetar, 2000);
    return;
  }

  setMsg("Atualizando SPX Status para Active...");
  hideAllOptions();
  markedActive = true;

  const r = await apiPost("setSpxActive", { driverId: ultimo });

  if (!r || !r.ok) {
    setMsg("Erro ao atualizar SPX: " + (r ? r.error : ""), "msg-erro");
    return;
  }

  dados.spx_status = "Active";
  $("res-spx").textContent = "Active";
  $("res-change").textContent = "SIM";

  $("opcoes-placa").style.display = "flex";
  setMsg("SPX atualizado. Confirme a placa.");
}

function confirmarPlaca(status) {
  placaStatus = status;
  $("opcoes-veiculo").style.display = "flex";
  setMsg("Confirme o tipo de veículo.");
}

async function confirmarVeiculo(status) {
  veiculoStatus = status;

  const payload = {
    codigo: ultimo,
    placa: dados.placa,
    placaStatus: placaStatus,
    tipoVeiculo: dados.tipo,
    veiculoStatus: status,
    spx_status: dados.spx_status || "",
    markedActive: markedActive
  };

  setMsg("Salvando...");

  const r = await apiPost("saveScan", payload);

  if (!r || !r.ok) {
    setMsg("Erro ao salvar: " + (r ? r.error : ""), "msg-erro");
    return;
  }

  setMsg("✓ Salvo!", "msg-ok");
  setTimeout(resetar, 2000);
}

function resetar() {
  $("res-id").textContent = "–";
  $("res-nome").textContent = "–";
  $("res-placa").textContent = "–";
  $("res-tipo").textContent = "–";
  $("res-spx").textContent = "–";
  $("res-change").textContent = "–";

  hideAllOptions();

  markedActive = false;
  liberado = false;
  ultimo = null;
  dados = null;
  placaStatus = null;
  veiculoStatus = null;

  setMsg("Aponte para o próximo QR Code.");
}

document.addEventListener("DOMContentLoaded", () => {
  debugLog("Página carregada", "ok", {
    href: location.href,
    protocol: location.protocol,
    secureContext: window.isSecureContext,
    userAgent: navigator.userAgent
  });

  ensureScannerInstance();

  $("btn-open-camera").addEventListener("click", iniciarCamera);
  $("btn-stop-camera").addEventListener("click", pararCamera);
  $("btn-switch-camera").addEventListener("click", trocarCamera);
  $("btn-test-camera").addEventListener("click", testarPermissao);
  $("btn-toggle-help").addEventListener("click", toggleAjudaPermissao);

  $("btn-liberar").addEventListener("click", liberar);
  $("btn-spx-active").addEventListener("click", () => confirmarSPX("ACTIVE"));
  $("btn-spx-divergencia").addEventListener("click", () => confirmarSPX("DIVERGENCIA"));
  $("btn-placa-ok").addEventListener("click", () => confirmarPlaca("OK"));
  $("btn-placa-divergente").addEventListener("click", () => confirmarPlaca("DIVERGENTE"));
  $("btn-veiculo-ok").addEventListener("click", () => confirmarVeiculo("OK"));
  $("btn-veiculo-divergente").addEventListener("click", () => confirmarVeiculo("DIVERGENTE"));
});

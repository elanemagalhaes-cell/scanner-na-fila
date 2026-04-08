const API_BASE_URL = "https://script.google.com/a/macros/shopee.com/s/AKfycbxoe-Y8Y4B9qWT3D1ZFMjdXDMx92j5-ht_0HHIZFyDNmAFNoDALXi_YiX8Jqd4HAMib/exec";

let ultimo = null;
let dados = null;
let placaStatus = null;
let veiculoStatus = null;
let markedActive = false;
let liberado = false;
let qr = null;
let ultimoScanAt = 0;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    qr = new Html5Qrcode("reader");

    await qr.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      scanOK,
      () => {}
    );
  } catch (err) {
    const msgEl = document.getElementById("msg");
    msgEl.className = "msg-erro";
    msgEl.textContent = "Erro ao abrir câmera: " + (err?.message || err || "");
  }
});

async function apiPost(action, payload = {}) {
  const response = await fetch(API_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      origin: window.location.origin,
      ...payload
    })
  });

  const data = await response.json();
  return data;
}

function hideAllOptions(){
  document.getElementById("opcao-liberar").style.display = "none";
  document.getElementById("opcoes-spx").style.display = "none";
  document.getElementById("opcoes-placa").style.display = "none";
  document.getElementById("opcoes-veiculo").style.display = "none";
}

async function seguirFluxoNormal(){
  const msgEl = document.getElementById("msg");
  msgEl.className = "";
  msgEl.textContent = "Buscando dados...";
  hideAllOptions();

  try {
    const r = await apiPost("getPlaca", { driverId: ultimo });

    if (!r || !r.ok) {
      msgEl.className = "msg-erro";
      msgEl.textContent = "Erro: " + (r ? r.error : "");
      return;
    }

    dados = r;
    document.getElementById("res-nome").textContent = r.nome || "–";
    document.getElementById("res-placa").textContent = r.placa || "–";
    document.getElementById("res-tipo").textContent = r.tipo || "–";
    document.getElementById("res-spx").textContent = r.spx_status || "–";
    document.getElementById("res-change").textContent = "–";

    const spx = (r.spx_status || "").trim();

    if (spx && spx !== "Active") {
      document.getElementById("opcoes-spx").style.display = "flex";
      msgEl.className = "";
      msgEl.textContent = "SPX status diferente de Active. Selecione: Active ou Divergência.";
      return;
    }

    document.getElementById("opcoes-placa").style.display = "flex";
    msgEl.className = "";
    msgEl.textContent = "Confirme a placa.";
  } catch (err) {
    msgEl.className = "msg-erro";
    msgEl.textContent = "Erro de comunicação com backend.";
  }
}

async function scanOK(texto) {
  const agora = Date.now();
  if (!texto) return;
  if (ultimo === texto && (agora - ultimoScanAt) < 3000) return;

  ultimoScanAt = agora;
  ultimo = texto;
  dados = null;
  placaStatus = null;
  veiculoStatus = null;
  markedActive = false;
  liberado = false;

  document.getElementById("res-id").textContent = texto;
  document.getElementById("res-nome").textContent = "–";
  document.getElementById("res-placa").textContent = "–";
  document.getElementById("res-tipo").textContent = "–";
  document.getElementById("res-spx").textContent = "–";
  document.getElementById("res-change").textContent = "–";

  hideAllOptions();

  const msgEl = document.getElementById("msg");
  msgEl.className = "";
  msgEl.textContent = "Verificando Check-in...";

  try {
    const r = await apiPost("checkCheckin", { driverId: texto });

    if (!r || !r.ok) {
      msgEl.className = "msg-erro";
      msgEl.textContent = "Erro: " + (r ? r.error : "");
      return;
    }

    if (r.hasCheckin !== true) {
      msgEl.className = "msg-erro";
      msgEl.textContent = "Check in não foi realizado. Clique em LIBERAR para continuar.";
      document.getElementById("opcao-liberar").style.display = "flex";
      document.getElementById("opcao-liberar").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    await seguirFluxoNormal();
  } catch (err) {
    msgEl.className = "msg-erro";
    msgEl.textContent = "Erro de comunicação com backend.";
  }
}

function liberar(){
  if (!ultimo) return;
  liberado = true;
  seguirFluxoNormal();
}

async function confirmarSPX(opcao){
  if (!dados || !ultimo) return;

  if (opcao === "DIVERGENCIA") {
    const payload = {
      codigo: ultimo,
      placa: dados.placa,
      placaStatus: '',
      tipoVeiculo: dados.tipo,
      veiculoStatus: '',
      spx_status: dados.spx_status || '',
      markedActive: false
    };

    document.getElementById("msg").className = "";
    document.getElementById("msg").textContent = "Registrando como Divergente...";
    hideAllOptions();

    try {
      const r = await apiPost("saveDivergente", payload);

      if (!r || !r.ok) {
        document.getElementById("msg").className = "msg-erro";
        document.getElementById("msg").textContent = "Erro ao registrar Divergente";
        setTimeout(resetar, 2500);
        return;
      }

      document.getElementById("msg").className = "msg-ok";
      document.getElementById("msg").textContent = "✓ Registrado como Divergente!";
      setTimeout(resetar, 2000);
    } catch (err) {
      document.getElementById("msg").className = "msg-erro";
      document.getElementById("msg").textContent = "Erro de comunicação com backend.";
    }

    return;
  }

  document.getElementById("msg").className = "";
  document.getElementById("msg").textContent = "Atualizando SPX Status para Active...";
  hideAllOptions();
  markedActive = true;

  try {
    const r = await apiPost("setSpxActive", { driverId: ultimo });

    if (!r || !r.ok) {
      document.getElementById("msg").className = "msg-erro";
      document.getElementById("msg").textContent =
        "Erro ao atualizar SPX: " + (r ? r.error : "");
      setTimeout(resetar, 2500);
      return;
    }

    dados.spx_status = "Active";
    document.getElementById("res-spx").textContent = "Active";
    document.getElementById("res-change").textContent = "SIM";

    document.getElementById("opcoes-placa").style.display = "flex";
    document.getElementById("msg").className = "";
    document.getElementById("msg").textContent = "SPX atualizado. Confirme a placa.";
  } catch (err) {
    document.getElementById("msg").className = "msg-erro";
    document.getElementById("msg").textContent = "Erro de comunicação com backend.";
  }
}

function confirmarPlaca(status) {
  placaStatus = status;
  document.getElementById("msg").className = "";
  document.getElementById("msg").textContent = "Confirme o tipo de veículo.";
  document.getElementById("opcoes-veiculo").style.display = "flex";
}

async function confirmarVeiculo(status) {
  veiculoStatus = status;

  const payload = {
    codigo: ultimo,
    placa: dados.placa,
    placaStatus: placaStatus,
    tipoVeiculo: dados.tipo,
    veiculoStatus: status,
    spx_status: dados.spx_status || '',
    markedActive: markedActive
  };

  document.getElementById("msg").className = "";
  document.getElementById("msg").textContent = "Salvando...";

  try {
    const r = await apiPost("saveScan", payload);

    if (!r || !r.ok) {
      document.getElementById("msg").className = "msg-erro";
      document.getElementById("msg").textContent = "Erro ao salvar";
      return;
    }

    document.getElementById("msg").className = "msg-ok";
    document.getElementById("msg").textContent = "✓ Salvo!";
    setTimeout(resetar, 2000);
  } catch (err) {
    document.getElementById("msg").className = "msg-erro";
    document.getElementById("msg").textContent = "Erro de comunicação com backend.";
  }
}

function resetar() {
  document.getElementById("res-id").textContent = "–";
  document.getElementById("res-nome").textContent = "–";
  document.getElementById("res-placa").textContent = "–";
  document.getElementById("res-tipo").textContent = "–";
  document.getElementById("res-spx").textContent = "–";
  document.getElementById("res-change").textContent = "–";
  document.getElementById("msg").className = "";
  document.getElementById("msg").textContent = "";
  hideAllOptions();
  markedActive = false;
  liberado = false;
  ultimo = null;
  dados = null;
  placaStatus = null;
  veiculoStatus = null;
}

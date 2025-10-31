// registerScript.js
// 🔗 SUA URL /exec do Apps Script
const API =
  "https://script.google.com/macros/s/AKfycbzwGBCcZSqWVMXuPYYnH6sa77Uz12oWRipXfdUD-if5HCBiaiBGZ2FIfRMxayYYYXoiEA/exec";

// ──────────────────────────────────────────────────────────────────────────────
// Seletores / estado
const qs = new URLSearchParams(location.search);
const codigo = (qs.get("c") || qs.get("codigo") || "").trim() || "SEM-CODIGO";

const pill = document.getElementById("pill");
const form = document.getElementById("form");
const msg = document.getElementById("msg");
const qrbox = document.getElementById("qrbox");
const btnBaixar = document.getElementById("btnBaixar");
//const btnNovo = document.getElementById("btnNovo");
const btnLimpar = document.getElementById("btnLimpar");
const btnSubmit = document.getElementById("btnSubmit");

const eventTitle = document.getElementById("eventTitle");
const eventUniversity = document.getElementById("eventUniversity");
const eventDate = document.getElementById("eventDate");
const semestreSelect = document.getElementById("semestre");

let lastPNG = null;

// ──────────────────────────────────────────────────────────────────────────────
// UI inicial
pill.textContent = "Código: " + codigo;

function preencherSemestres() {
  const frag = document.createDocumentFragment();
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "Selecione…";
  frag.appendChild(opt0);

  const optNA = document.createElement("option");
  optNA.value = "N/A";
  optNA.textContent = "Não se aplica";
  frag.appendChild(optNA);

  for (let i = 1; i <= 12; i++) {
    const opt = document.createElement("option");
    opt.value = `${i}º`;
    opt.textContent = `${i}º`;
    frag.appendChild(opt);
  }
  semestreSelect.appendChild(frag);
}

// ──────────────────────────────────────────────────────────────────────────────
// Carrega dados do evento a partir da planilha (sem parse de datas/horas)
async function carregarPalestra() {
  if (codigo === "SEM-CODIGO") {
    msg.innerHTML = '<span class="err">Inclua ?c=CODIGO na URL.</span>';
    btnSubmit.disabled = true;
    return;
  }
  try {
    const r = await fetch(`${API}?codigo=${encodeURIComponent(codigo)}`);
    const res = await r.json();

    if (!res.ok) {
      eventTitle.textContent = "Palestra não encontrada";
      eventUniversity.textContent = "";
      eventDate.textContent = "";
      btnSubmit.disabled = true;
      msg.innerHTML = '<span class="err">Código inválido na planilha.</span>';
      return;
    }

    const p = res.palestra || {};
    // Título
    eventTitle.textContent =
      p.descricao || p.DESCRICAO || p.CodigoPalestra || "Palestra";

    // UNIVERSIDADE: UFPR
    const uni = p.Universidade || p.UNIVERSIDADE || "";
    eventUniversity.textContent = uni ? `UNIVERSIDADE: ${uni}` : "";

    // Horario: 23/10/2025 12:00  (usa strings vindas da planilha/API)
    const dataStr = p.Data || p.dataBR || p.data || "";
    const horaStr = p.Horario || p.HORARIO || "";
    const horarioLinha = [dataStr, horaStr].filter(Boolean).join(" ");
    eventDate.textContent = horarioLinha ? `Horario: ${horarioLinha}` : "";

    // Ativo (se não houver coluna, assume true)
    const ativo =
      typeof p.ativo === "boolean"
        ? p.ativo
        : p.ATIVO != null
        ? String(p.ATIVO).toLowerCase() === "true"
        : true;

    if (!ativo) {
      btnSubmit.disabled = true;
      msg.innerHTML =
        '<span class="err">Palestra inativa — geração de QR bloqueada.</span>';
    } else {
      btnSubmit.disabled = false;
      msg.innerHTML =
        '<span class="ok">Palestra ativa — pode gerar o QR.</span>';
    }
  } catch (e) {
    console.error(e);
    btnSubmit.disabled = true;
    msg.innerHTML = '<span class="err">Falha ao acessar a API.</span>';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Envia TODOS os dados preenchidos na inscrição
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (btnSubmit.disabled) return;

  const email = document.getElementById("email").value.trim();
  const nome = document.getElementById("nome").value.trim();
  const periodo = document.getElementById("periodo").value;
  const perfil = document.getElementById("perfil").value;
  const semestre = document.getElementById("semestre").value;
  const anoFormatura = document.getElementById("anoFormatura").value.trim();
  const aceiteCompliance = document.getElementById("aceiteCompliance").checked;

  // Extrai textos mostrados (sem parse)
  const universidade = (eventUniversity.textContent || "").replace(
    /^UNIVERSIDADE:\s*/i,
    ""
  );
  const horarioTexto = (eventDate.textContent || "").replace(
    /^Horario:\s*/i,
    ""
  );
  const [dataPalestra, horaPalestra] = horarioTexto.split(" ");

  if (
    !email ||
    !codigo ||
    !nome ||
    !periodo ||
    !perfil ||
    !semestre ||
    !anoFormatura ||
    !aceiteCompliance
  ) {
    msg.innerHTML = '<span class="err">Preencha todos os campos.</span>';
    return;
  }
  if (!/^\d{4}$/.test(anoFormatura)) {
    msg.innerHTML =
      '<span class="err">Informe um ano válido com 4 dígitos (ex.: 2027).</span>';
    return;
  }

  if (!aceiteCompliance) {
    msg.innerHTML =
      '<span class="err">É necessário autorizar o uso dos dados para prosseguir.</span>';
    return;
  }

  msg.innerHTML = "Registrando…";

  try {
    const body = new URLSearchParams({
      action: "registrar",
      CodigoPalestra: codigo,
      Universidade: universidade,
      Nome: nome,
      Email: email,
      Perfil: perfil,
      Periodo: periodo,
      Semestre: semestre,
      AnoFormatura: anoFormatura,
      Data: dataPalestra || "",
      Horario: horaPalestra || "",
      compilance: aceiteCompliance
    }).toString();

    const resp = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await resp.json();

    if (!data.ok) {
      msg.innerHTML = `<span class="err">${
        data.error || "Erro ao registrar"
      }</span>`;
      return;
    }

    // Gera QR com email|codigo
    const conteudo = `${email}|${codigo}`;
    qrbox.innerHTML = "";
    const container = document.createElement("div");
    qrbox.appendChild(container);

    new QRCode(container, {
      text: conteudo,
      width: 250,
      height: 250,
      correctLevel: QRCode.CorrectLevel.M,
    });

    setTimeout(() => {
      const img = container.querySelector("img");
      lastPNG = img ? img.src : null;
      btnBaixar.disabled = !lastPNG;
      //btnNovo.disabled = false;
      const statusTxt =
        data.status === "existente" ? " (já cadastrado)" : " (novo)";
      msg.innerHTML = `<span class="ok">QR gerado${statusTxt}: <b>${conteudo}</b></span>`;
    }, 150);
  } catch (e) {
    console.error(e);
    msg.innerHTML =
      '<span class="err">Erro ao registrar. Tente novamente.</span>';
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Ações auxiliares
btnBaixar.onclick = () => {
  if (!lastPNG) return;
  const a = document.createElement("a");
  a.href = lastPNG;
  a.download = "qrcode.png";
  a.click();
};

// btnNovo.onclick = () => {
//   qrbox.innerHTML = '<div class="muted" style="text-align:center">Preencha o formulário e gere seu QR.</div>';
//   msg.textContent = "";
//   btnBaixar.disabled = true;
//   btnNovo.disabled = true;
// };

btnLimpar.onclick = () => {
  form.reset();
  msg.textContent = "";
  document.getElementById("nome").focus();
};

// ──────────────────────────────────────────────────────────────────────────────
// Boot
preencherSemestres();
carregarPalestra();

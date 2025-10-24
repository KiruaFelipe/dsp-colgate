const API = "https://script.google.com/macros/s/AKfycbzwGBCcZSqWVMXuPYYnH6sa77Uz12oWRipXfdUD-if5HCBiaiBGZ2FIfRMxayYYYXoiEA/exec";

const qs = new URLSearchParams(location.search);
const codigoUrl = (qs.get('c') || '').trim() || 'SEM-CODIGO';
document.getElementById('pill').textContent = 'Código: ' + codigoUrl;

const video = document.getElementById('video');
const startBtn = document.getElementById('start');
const stopBtn  = document.getElementById('stop');
const statusEl = document.getElementById('status');

const backdrop   = document.getElementById('backdrop');
const mEmail     = document.getElementById('mEmail');
const mCodigo    = document.getElementById('mCodigo');
const mTs        = document.getElementById('mTs');
const modalBadge = document.getElementById('modalBadge');
const btnCancelar   = document.getElementById('btnCancelar');
const btnConfirmar  = document.getElementById('btnConfirmar');
const modalInfo  = document.getElementById('modalInfo');
const toast      = document.getElementById('toast');

let stream = null;
let running = false;
let modalOpen = false;
let lastPayload = null;
let scanningTimer = null;
const SCAN_INTERVAL = 250;          
const RESCAN_COOLDOWN_MS = 350;     
let nextAllowedScanTs = 0;

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function showToast(txt, ok = true, ms = 2000) {
  toast.style.background = ok ? '#0e9f6e' : '#dc2626';
  toast.textContent = txt;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), ms);
}

function setConfirmBusy(busy) {
  if (busy) {
    btnConfirmar.dataset._oldText = btnConfirmar.textContent;
    btnConfirmar.textContent = 'Confirmando…';
    btnConfirmar.disabled = true;
  } else {
    btnConfirmar.textContent = btnConfirmar.dataset._oldText || 'Confirmar presença';
    btnConfirmar.disabled = false;
  }
}

function openModal(email, codigo){
  modalOpen = true;
  mEmail.textContent = email || '—';
  mCodigo.textContent = codigo || '—';
  mTs.textContent = new Date().toLocaleString();
  modalBadge.textContent = 'Palestra: ' + (codigo || '—');
  modalInfo.textContent = '';
  pauseScanning();
  backdrop.classList.add('show');
  backdrop.setAttribute('aria-hidden','false');
}
function closeModal(){
  modalOpen = false;
  backdrop.classList.remove('show');
  backdrop.setAttribute('aria-hidden','true');
  lastPayload = null;
  nextAllowedScanTs = Date.now() + RESCAN_COOLDOWN_MS;
  resumeScanning();
}

function startScanning(){
  if (scanningTimer) return;
  scanningTimer = setInterval(scanTick, SCAN_INTERVAL);
}
function pauseScanning(){
  if (scanningTimer) { clearInterval(scanningTimer); scanningTimer = null; }
}
function resumeScanning(){
  if (running && !modalOpen) startScanning();
}
function stopScanning(){
  pauseScanning();
}

function scanTick(){
  if (!running || modalOpen) return;
  if (Date.now() < nextAllowedScanTs) return;

  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const qr = jsQR(img.data, img.width, img.height, { inversionAttempts:'dontInvert' });

    if (qr && qr.data) {
      const parts = (qr.data || '').trim().split('|');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        statusEl.innerHTML = '<span class="err"><b>Erro: QRCode Invalido</b></span> — <span class="muted">Situação: QrCode com o formato inválido</span>';
      } else {
        const email = parts[0];
        const codigo = parts[1];

        if (codigo !== codigoUrl) {
          statusEl.innerHTML = '<span class="err"><b>Erro: QrCode Palestra nao encontrada</b></span> — <span class="muted">Situação: Está no formato correto porém com o código errado</span>';
        } else {
          const payload = `${email}|${codigo}`;
          if (payload !== lastPayload) {
            lastPayload = payload;
            statusEl.innerHTML = '<span class="ok">QR detectado</span>';
            openModal(email, codigo);
          }
        }
      }
      nextAllowedScanTs = Date.now() + RESCAN_COOLDOWN_MS;
    }
  }
}

async function startCam(){
  try{
    if (running) return;
    statusEl.textContent = 'Abrindo câmera…';

    const active = stream && stream.getTracks && stream.getTracks().some(t => t.readyState === 'live');
    if (!active) {
      stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    }
    video.srcObject = stream;
    await video.play().catch(()=>{});
    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Câmera ativa…';

    resumeScanning();
  }catch(e){
    console.error(e);
    statusEl.innerHTML = '<span class="err">Erro ao abrir câmera</span>';
  }
}
function stopCam(){
  running = false;
  stopScanning();
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  if (stream && stream.getTracks) {
    stream.getTracks().forEach(t => t.stop());
  }
  stream = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'Parado.';
}

startBtn.onclick = startCam;
stopBtn.onclick  = stopCam;
backdrop.addEventListener('click',(e)=>{ if(e.target===backdrop) closeModal(); });
window.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeModal(); });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseScanning();
    statusEl.textContent = 'Pausado (aba oculta)…';
  } else {
    nextAllowedScanTs = Date.now() + RESCAN_COOLDOWN_MS;
    resumeScanning();
    if (running) statusEl.textContent = 'Câmera ativa…';
  }
});

btnConfirmar.addEventListener('click', async ()=>{
  setConfirmBusy(true);
  modalInfo.textContent = 'Registrando presença…';
  try{
    const email = mEmail.textContent.trim();
    const body = new URLSearchParams({
      action:'presenca',
      codigoPalestra: codigoUrl,
      email
    }).toString();

    const resp = await fetch(API, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body
    });
    const data = await resp.json();

    if (!data.ok) {
      modalInfo.innerHTML = `<span class="err">${data.error || 'Falha ao confirmar'}</span>`;
      showToast('Erro ao confirmar presença', false, 2500);
      setTimeout(closeModal, 2000);
    } else if (data.status === 'ja_confirmada') {
      modalInfo.innerHTML = `<span class="ok">Presença já estava confirmada ✓</span>`;
      showToast('Presença já confirmada anteriormente ✓', true, 3200);
      setTimeout(closeModal, 2600); 
    } else {
      modalInfo.innerHTML = `<span class="ok">Presença confirmada ✓</span>`;
      showToast('Presença confirmada ✓', true, 2400);
      setTimeout(closeModal, 1600);
    }
  }catch(e){
    console.error(e);
    modalInfo.innerHTML = `<span class="err">Erro ao confirmar</span>`;
    showToast('Erro ao confirmar presença', false, 2500);
    setTimeout(closeModal, 2000);
  }finally{
    setConfirmBusy(false);
  }
});

btnCancelar.addEventListener('click', closeModal);

(async () => {
  const elCodigo = document.getElementById('infoCodigo');
  const elUni    = document.getElementById('infoUni');
  const elHor    = document.getElementById('infoHorario');
  const startBtn = document.getElementById('start');
  const statusEl = document.getElementById('status');

  if (codigoUrl === 'SEM-CODIGO') {
    elCodigo.textContent = '—';
    elUni.textContent    = '—';
    elHor.textContent    = '—';
    startBtn.disabled = true;
    statusEl.innerHTML = '<span class="err">Inclua ?c=CODIGO na URL.</span>';
    return;
  }

  try {
    elCodigo.textContent = 'Carregando…';
    elUni.textContent    = 'Carregando…';
    elHor.textContent    = 'Carregando…';

    const r = await fetch(`${API}?codigo=${encodeURIComponent(codigoUrl)}`);
    const res = await r.json();

    if (!res.ok) throw new Error('Palestra não encontrada');
    if (!res.palestra.ativo) throw new Error('Palestra inativa');

    const p = res.palestra || {};
    elCodigo.textContent = p.codigo || codigoUrl;
    elUni.textContent    = p.Universidade || '—';
    elHor.textContent    = `${p.Data || ''} ${p.Horario || ''}`.trim() || '—';
  } catch (e) {
    elCodigo.textContent = codigoUrl;
    elUni.textContent    = '—';
    elHor.textContent    = '—';
    startBtn.disabled = true;
    statusEl.innerHTML = `<span class="err">${e.message}</span>`;
  }
})();

window.addEventListener('beforeunload', () => {
  stopCam();
});

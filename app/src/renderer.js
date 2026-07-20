const { ipcRenderer } = require('electron');

const elements = {
  videoCanvas: document.getElementById('video-canvas'),
  scanIndicator: document.getElementById('scan-indicator'),
  fieldNit: document.getElementById('field-nit'),
  fieldFactura: document.getElementById('field-factura'),
  fieldAutorizacion: document.getElementById('field-autorizacion'),
  fieldMonto: document.getElementById('field-monto'),
  fieldStatus: document.getElementById('field-status'),
  historyList: document.getElementById('history-list'),
  btnStart: document.getElementById('btn-start'),
  btnUpload: document.getElementById('btn-upload'),
  btnEditNit: document.getElementById('btn-edit-nit'),
  btnSiatSettings: document.getElementById('btn-siat-settings'),
  modalSiat: document.getElementById('modal-siat'),
  btnModalClose: document.getElementById('btn-modal-close'),
  btnModalSave: document.getElementById('btn-modal-save'),
  siatIdentity: document.getElementById('siat-identity'),
  siatEmail: document.getElementById('siat-email'),
  siatPassword: document.getElementById('siat-password'),
  modalStatus: document.getElementById('modal-status')
};

const ctx = elements.videoCanvas.getContext('2d');

let state = {
  isRunning: false,
  history: [],
  currentData: null,
  nitEditing: false
};

function drawVideoFrame(frameData) {
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, elements.videoCanvas.width, elements.videoCanvas.height);
  };
  img.src = 'data:image/jpeg;base64,' + frameData;
}

function showResult(fields, rawQr) {
  state.currentData = fields;
  
  elements.fieldAutorizacion.value = fields.autorizacion;
  elements.fieldFactura.value = fields.factura;
  
  if (elements.fieldNit.value === '---' || elements.fieldNit.value === '') {
    elements.fieldNit.value = fields.nit;
  }
  if (elements.fieldMonto.value === '---' || elements.fieldMonto.value === '') {
    elements.fieldMonto.value = fields.monto;
  }
  
  elements.fieldStatus.textContent = 'QR ESCANEADO CORRECTAMENTE';
  elements.fieldStatus.classList.add('scanned');
  
  elements.btnUpload.disabled = false;
  
  addToHistory(fields);
}

function addToHistory(fields) {
  const exists = state.history.some(item => 
    item.autorizacion === fields.autorizacion && item.factura === fields.factura
  );
  if (exists) return;
  
  const now = new Date();
  const time = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  
  state.history.unshift({ ...fields, time });
  
  if (state.history.length > 50) state.history.pop();
  
  renderHistory();
}

function renderHistory() {
  if (state.history.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">Sin registros</div>';
    return;
  }
  
  elements.historyList.innerHTML = state.history.map((item, index) => `
    <div class="history-item" data-index="${index}">
      <span class="history-item-num">${state.history.length - index}</span>
      <span class="history-item-nit">Aut: ${item.autorizacion}</span>
      <span class="history-item-factura">Fact: ${item.factura}</span>
      <span class="history-item-monto">${item.monto !== '---' ? 'Bs. ' + item.monto : '---'}</span>
      <span class="history-item-status">OK</span>
    </div>
  `).join('');
  
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.dataset.index);
      const entry = state.history[index];
      if (entry) {
        elements.fieldAutorizacion.value = entry.autorizacion;
        elements.fieldFactura.value = entry.factura;
        elements.fieldNit.value = entry.nit;
        elements.fieldMonto.value = entry.monto;
      }
    });
  });
}

function toggleScanning() {
  if (state.isRunning) {
    ipcRenderer.send('send-command', { type: 'stop' });
    state.isRunning = false;
    elements.btnStart.textContent = 'INICIAR';
    elements.btnStart.className = 'btn btn-primary';
    elements.scanIndicator.classList.remove('active');
  } else {
    ipcRenderer.send('send-command', { type: 'start' });
    state.isRunning = true;
    elements.btnStart.textContent = 'DETENER';
    elements.btnStart.className = 'btn btn-stopped';
    elements.scanIndicator.classList.add('active');
  }
}

function toggleEditNit() {
  if (state.nitEditing) {
    elements.fieldNit.readOnly = true;
    elements.fieldNit.classList.remove('editing');
    elements.btnEditNit.textContent = 'EDITAR';
    elements.btnEditNit.classList.remove('active');
    state.nitEditing = false;
    
    if (state.currentData) {
      state.currentData.nit = elements.fieldNit.value;
    }
  } else {
    elements.fieldNit.readOnly = false;
    elements.fieldNit.classList.add('editing');
    elements.fieldNit.focus();
    elements.fieldNit.select();
    elements.btnEditNit.textContent = 'GUARDAR';
    elements.btnEditNit.classList.add('active');
    state.nitEditing = true;
  }
}

async function uploadToSIAT() {
  if (!state.currentData) return;

  state.currentData.nit = elements.fieldNit.value;
  state.currentData.monto = elements.fieldMonto.value;

  const hasCreds = await ipcRenderer.invoke('siat:has-credentials');
  if (!hasCreds) {
    openSiatModal();
    return;
  }

  elements.btnUpload.textContent = 'SUBIENDO...';
  elements.btnUpload.disabled = true;
  elements.fieldStatus.textContent = 'Conectando con SIAT...';

  const result = await ipcRenderer.invoke('siat:upload', state.currentData);

  elements.btnUpload.textContent = 'SUBIR A SIAT';
  elements.btnUpload.disabled = false;

  if (result.success) {
    elements.fieldStatus.textContent = 'SUBIDO CORRECTAMENTE';
    elements.fieldStatus.className = 'field-status scanned';
  } else {
    elements.fieldStatus.textContent = 'ERROR: ' + (result.error || 'Error al subir');
    elements.fieldStatus.className = 'field-status';
  }
}

function openSiatModal() {
  elements.modalSiat.style.display = 'flex';
  elements.siatIdentity.value = '';
  elements.siatEmail.value = '';
  elements.siatPassword.value = '';
  elements.modalStatus.textContent = '';
  elements.siatIdentity.focus();
}

function closeSiatModal() {
  elements.modalSiat.style.display = 'none';
}

// Event Listeners
document.getElementById('btn-minimize').addEventListener('click', () => {
  ipcRenderer.send('minimize-window');
});

document.getElementById('btn-maximize').addEventListener('click', () => {
  ipcRenderer.send('maximize-window');
});

document.getElementById('btn-close').addEventListener('click', () => {
  ipcRenderer.send('close-window');
});

elements.btnStart.addEventListener('click', toggleScanning);
elements.btnUpload.addEventListener('click', uploadToSIAT);
elements.btnEditNit.addEventListener('click', toggleEditNit);

elements.btnSiatSettings.addEventListener('click', async () => {
  const creds = await ipcRenderer.invoke('siat:get-credentials');
  elements.siatIdentity.value = creds?.identity || '';
  elements.siatEmail.value = creds?.email || '';
  elements.siatPassword.value = '';
  elements.modalStatus.textContent = creds ? 'Modificar credenciales' : 'Ingrese sus credenciales SIAT';
  elements.modalStatus.className = 'modal-status';
  openSiatModal();
});

elements.btnModalClose.addEventListener('click', closeSiatModal);
elements.modalSiat.addEventListener('click', (e) => {
  if (e.target === elements.modalSiat) closeSiatModal();
});

elements.btnModalSave.addEventListener('click', async () => {
  const identity = elements.siatIdentity.value.trim();
  const email = elements.siatEmail.value.trim();
  const password = elements.siatPassword.value.trim();

  if (!identity || !email || !password) {
    elements.modalStatus.textContent = 'Todos los campos son obligatorios';
    elements.modalStatus.className = 'modal-status error';
    return;
  }

  await ipcRenderer.invoke('siat:save-credentials', { identity, email, password });
  elements.modalStatus.textContent = 'Credenciales guardadas correctamente';
  elements.modalStatus.className = 'modal-status';
  setTimeout(closeSiatModal, 1000);
});

elements.fieldNit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.nitEditing) {
    toggleEditNit();
  }
});

// IPC Handlers
ipcRenderer.on('siat:progress', (event, progress) => {
  elements.fieldStatus.textContent = progress.message || 'Procesando...';
  elements.fieldStatus.className = 'field-status';
});

ipcRenderer.on('python-data', (event, data) => {
  switch (data.type) {
    case 'video_frame':
      drawVideoFrame(data.frame);
      break;
      
    case 'data_detected':
      showResult(data.fields, data.raw_qr);
      break;
      
    case 'upload_success':
      elements.btnUpload.textContent = 'SUBIDO';
      setTimeout(() => {
        elements.btnUpload.textContent = 'SUBIR A SIAT';
      }, 2000);
      break;
      
    case 'error':
      console.error('Error:', data.message);
      break;
  }
});

// Initialize
renderHistory();

const { ipcRenderer } = require('electron');

const elements = {
  videoCanvas: document.getElementById('video-canvas'),
  cameraPlaceholder: document.getElementById('camera-placeholder'),
  scanIndicator: document.getElementById('scan-indicator'),
  statusBanner: document.getElementById('status-banner'),
  statusBannerText: document.getElementById('status-banner-text'),
  fieldNit: document.getElementById('field-nit'),
  fieldFactura: document.getElementById('field-factura'),
  fieldAutorizacion: document.getElementById('field-autorizacion'),
  fieldMonto: document.getElementById('field-monto'),
  fieldStatus: document.getElementById('field-status'),
  fieldStatusText: document.getElementById('field-status-text'),
  historyList: document.getElementById('history-list'),
  historyCount: document.getElementById('history-count'),
  btnStart: document.getElementById('btn-start'),
  btnUpload: document.getElementById('btn-upload'),
  btnEditNit: document.getElementById('btn-edit-nit'),
  btnSelectCamera: document.getElementById('btn-select-camera'),
  cameraSelectLabel: document.getElementById('camera-select-label'),
  cameraModal: document.getElementById('camera-modal'),
  cameraModalBody: document.getElementById('camera-modal-body'),
  cameraModalLoading: document.getElementById('camera-modal-loading'),
  cameraModalClose: document.getElementById('camera-modal-close')
};

const ctx = elements.videoCanvas.getContext('2d');

const savedCameraIndex = localStorage.getItem('scanbo_camera_index');

let state = {
  isRunning: false,
  history: [],
  currentData: null,
  nitEditing: false,
  hasFrame: false,
  selectedCamera: savedCameraIndex !== null ? parseInt(savedCameraIndex) : null
};

updateCameraLabel();

function updateCameraLabel() {
  elements.cameraSelectLabel.textContent = state.selectedCamera === null
    ? 'AUTO'
    : `CAM ${state.selectedCamera}`;
}

function drawVideoFrame(frameData) {
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, 0, 0, elements.videoCanvas.width, elements.videoCanvas.height);
    if (!state.hasFrame) {
      state.hasFrame = true;
      elements.cameraPlaceholder.classList.add('hidden');
    }
  };
  img.src = 'data:image/jpeg;base64,' + frameData;
}

function flashField(el) {
  el.classList.remove('just-filled');
  // Force reflow so the animation can retrigger
  void el.offsetWidth;
  el.classList.add('just-filled');
}

function showResult(fields) {
  state.currentData = fields;

  elements.fieldAutorizacion.value = fields.autorizacion;
  elements.fieldFactura.value = fields.factura;
  flashField(elements.fieldAutorizacion);
  flashField(elements.fieldFactura);

  if (elements.fieldNit.value === '---' || elements.fieldNit.value === '') {
    elements.fieldNit.value = fields.nit;
  }
  if (elements.fieldMonto.value === '---' || elements.fieldMonto.value === '') {
    elements.fieldMonto.value = fields.monto;
  }

  setFieldStatus('QR ESCANEADO CORRECTAMENTE', 'scanned');

  elements.btnUpload.disabled = false;

  addToHistory(fields);
}

function setFieldStatus(text, variant) {
  elements.fieldStatusText.textContent = text;
  elements.fieldStatus.classList.remove('scanned', 'uploaded');
  if (variant) elements.fieldStatus.classList.add(variant);
}

function showBackendError(message) {
  elements.statusBannerText.textContent = message;
  elements.statusBanner.classList.add('visible');
}

function hideBackendError() {
  elements.statusBanner.classList.remove('visible');
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
  elements.historyCount.textContent = state.history.length;

  if (state.history.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">Sin registros</div>';
    return;
  }

  elements.historyList.innerHTML = state.history.map((item, index) => `
    <div class="history-item" data-index="${index}">
      <span class="history-item-num">${state.history.length - index}</span>
      <span class="history-item-time">${item.time}</span>
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
        state.currentData = { ...entry };
        elements.btnUpload.disabled = false;
      }
    });
  });
}

function toggleScanning() {
  if (state.isRunning) {
    ipcRenderer.send('send-command', { type: 'stop' });
    state.isRunning = false;
    state.hasFrame = false;
    elements.btnStart.textContent = 'INICIAR';
    elements.btnStart.className = 'btn btn-primary';
    elements.scanIndicator.classList.remove('active');
    elements.cameraPlaceholder.classList.remove('hidden');
    elements.btnSelectCamera.disabled = false;
  } else {
    ipcRenderer.send('send-command', {
      type: 'start',
      camera_index: state.selectedCamera
    });
    state.isRunning = true;
    elements.btnStart.textContent = 'DETENER';
    elements.btnStart.className = 'btn btn-stopped';
    elements.scanIndicator.classList.add('active');
    elements.btnSelectCamera.disabled = true;
    hideBackendError();
  }
}

function openCameraPicker() {
  if (state.isRunning) return;
  elements.cameraModal.classList.add('visible');
  elements.cameraModalLoading.style.display = 'block';
  document.querySelectorAll('.camera-option[data-index]:not(.camera-option-auto)').forEach(el => el.remove());
  markSelectedCameraOption();
  ipcRenderer.send('send-command', { type: 'list_cameras' });
}

function closeCameraPicker() {
  elements.cameraModal.classList.remove('visible');
}

function markSelectedCameraOption() {
  document.querySelectorAll('.camera-option').forEach(el => {
    const isAuto = el.dataset.index === 'auto';
    const matches = state.selectedCamera === null ? isAuto : el.dataset.index === String(state.selectedCamera);
    el.classList.toggle('selected', matches);
  });
}

function selectCamera(index) {
  state.selectedCamera = index;
  if (index === null) {
    localStorage.removeItem('scanbo_camera_index');
  } else {
    localStorage.setItem('scanbo_camera_index', String(index));
  }
  updateCameraLabel();
  closeCameraPicker();
}

function renderCameraOptions(cameras) {
  elements.cameraModalLoading.style.display = 'none';

  if (cameras.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'modal-loading';
    msg.textContent = 'No se detectaron camaras adicionales';
    elements.cameraModalBody.appendChild(msg);
    return;
  }

  cameras.forEach(cam => {
    const opt = document.createElement('div');
    opt.className = 'camera-option';
    opt.dataset.index = String(cam.index);
    opt.innerHTML = `
      <div class="camera-option-thumb">
        <img src="data:image/jpeg;base64,${cam.thumbnail}" alt="Camara ${cam.index}">
      </div>
      <span class="camera-option-label">Camara ${cam.index}</span>
    `;
    opt.addEventListener('click', () => selectCamera(cam.index));
    elements.cameraModalBody.appendChild(opt);
  });

  markSelectedCameraOption();
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

function uploadToSIAT() {
  if (!state.currentData) return;

  state.currentData.nit = elements.fieldNit.value;
  state.currentData.monto = elements.fieldMonto.value;

  ipcRenderer.send('send-command', {
    type: 'upload_siat',
    data: state.currentData
  });

  elements.btnUpload.textContent = 'SUBIENDO...';
  elements.btnUpload.classList.add('uploading');
  elements.btnUpload.disabled = true;
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
elements.btnSelectCamera.addEventListener('click', openCameraPicker);
elements.cameraModalClose.addEventListener('click', closeCameraPicker);
elements.cameraModal.addEventListener('click', (e) => {
  if (e.target === elements.cameraModal) closeCameraPicker();
});
document.querySelector('.camera-option-auto').addEventListener('click', () => selectCamera(null));

elements.fieldNit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.nitEditing) {
    toggleEditNit();
  }
});

// IPC Handlers
ipcRenderer.on('python-data', (event, data) => {
  switch (data.type) {
    case 'video_frame':
      drawVideoFrame(data.frame);
      break;

    case 'data_detected':
      showResult(data.fields);
      break;

    case 'camera_list':
      renderCameraOptions(data.cameras);
      break;

    case 'upload_success':
      elements.btnUpload.textContent = 'SUBIDO';
      elements.btnUpload.classList.remove('uploading');
      setFieldStatus('SUBIDO CORRECTAMENTE', 'uploaded');
      setTimeout(() => {
        elements.btnUpload.textContent = 'SUBIR A SIAT';
        elements.btnUpload.disabled = false;
      }, 2000);
      break;

    case 'error':
      showBackendError(data.message);
      if (state.isRunning) {
        state.isRunning = false;
        elements.btnStart.textContent = 'INICIAR';
        elements.btnStart.className = 'btn btn-primary';
        elements.scanIndicator.classList.remove('active');
        elements.btnSelectCamera.disabled = false;
      }
      break;
  }
});

// Initialize
renderHistory();

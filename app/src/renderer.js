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
  tabEntel: document.getElementById('tab-entel'),
  tabStatusPending: document.getElementById('tab-status-pending'),
  tabStatusRegistered: document.getElementById('tab-status-registered'),
  btnStart: document.getElementById('btn-start'),
  btnUpload: document.getElementById('btn-upload'),
  btnEditNit: document.getElementById('btn-edit-nit'),
  btnEditFactura: document.getElementById('btn-edit-factura'),
  btnEditAutorizacion: document.getElementById('btn-edit-autorizacion'),
  btnEditMonto: document.getElementById('btn-edit-monto'),
  btnSelectCamera: document.getElementById('btn-select-camera'),
  cameraSelectLabel: document.getElementById('camera-select-label'),
  cameraModal: document.getElementById('camera-modal'),
  cameraModalBody: document.getElementById('camera-modal-body'),
  cameraModalLoading: document.getElementById('camera-modal-loading'),
  cameraModalClose: document.getElementById('camera-modal-close'),
  btnSiatSettings: document.getElementById('btn-siat-settings'),
  btnTestData: document.getElementById('btn-test-data'),
  modalSiat: document.getElementById('modal-siat'),
  btnModalClose: document.getElementById('btn-modal-close'),
  btnModalSave: document.getElementById('btn-modal-save'),
  siatIdentity: document.getElementById('siat-identity'),
  siatEmail: document.getElementById('siat-email'),
  siatPassword: document.getElementById('siat-password'),
  modalStatus: document.getElementById('modal-status'),
  modalConfirm: document.getElementById('modal-confirm'),
  modalConfirmText: document.getElementById('modal-confirm-text'),
  btnConfirmOk: document.getElementById('btn-confirm-ok'),
  btnConfirmCancel: document.getElementById('btn-confirm-cancel'),
  btnConfirmClose: document.getElementById('btn-confirm-close'),
};

const ctx = elements.videoCanvas.getContext('2d');

const savedCameraIndex = localStorage.getItem('scanbo_camera_index');

let state = {
  isRunning: false,
  records: [],
  selectedEmpresa: 'entel',
  statusGroup: 'pending',
  currentData: null,
  nitEditing: false,
  facturaEditing: false,
  autorizacionEditing: false,
  montoEditing: false,
  hasFrame: false,
  selectedCamera: savedCameraIndex !== null ? parseInt(savedCameraIndex) : null,
  pendingDeleteId: null
};

const EMPRESA_LABELS = { entel: 'ENTEL', otro: 'sin clasificar' };

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

  elements.btnUpload.disabled = false;

  saveCurrentRecord();
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

async function saveCurrentRecord() {
  const fields = {
    autorizacion: elements.fieldAutorizacion.value,
    factura: elements.fieldFactura.value,
    nit: elements.fieldNit.value,
    monto: elements.fieldMonto.value
  };

  const result = await ipcRenderer.invoke('db:save-invoice', fields);

  if (!result.success) {
    setFieldStatus('Error al guardar: ' + result.error, '');
    return;
  }

  setFieldStatus(`QR ESCANEADO - ${EMPRESA_LABELS[result.empresa]}`, 'scanned');

  if (result.empresa === state.selectedEmpresa) {
    loadRecords(state.selectedEmpresa);
  }
}

async function loadRecords(empresa) {
  state.records = await ipcRenderer.invoke('db:get-invoices', empresa, state.statusGroup);
  renderHistory();
}

function switchStatusGroup(statusGroup) {
  state.statusGroup = statusGroup;
  elements.tabStatusPending.classList.toggle('selected', statusGroup === 'pending');
  elements.tabStatusRegistered.classList.toggle('selected', statusGroup === 'registered');
  // Ya estan registradas en SIAT, no tiene sentido volver a subirlas desde aca.
  elements.btnUpload.disabled = statusGroup === 'registered';
  loadRecords(state.selectedEmpresa);
}

async function switchEmpresa(empresa) {
  state.selectedEmpresa = empresa;
  elements.tabEntel.classList.toggle('selected', empresa === 'entel');

  const nit = await ipcRenderer.invoke('db:get-empresa-nit', empresa);
  if (nit) {
    elements.fieldNit.value = nit;
    flashField(elements.fieldNit);
  }

  loadRecords(empresa);
}

function renderHistory() {
  elements.historyCount.textContent = state.records.length;

  if (state.records.length === 0) {
    elements.historyList.innerHTML = '<div class="history-empty">Sin registros</div>';
    return;
  }

  const STATUS_LABELS = { Pending: 'PEND', OK: 'OK', Invalid: 'ERR', Duplicated: 'DUP' };
  const STATUS_CLASSES = { Pending: 'status-pending', OK: 'status-ok', Invalid: 'status-invalid', Duplicated: 'status-duplicated' };

  elements.historyList.innerHTML = state.records.map((item, index) => {
    const time = new Date(item.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const st = item.status || 'Pending';
    return `
    <div class="history-item" data-index="${index}">
      <span class="history-item-num">${state.records.length - index}</span>
      <span class="history-item-time">${time}</span>
      <span class="history-item-nit">Aut: ${item.autorizacion}</span>
      <span class="history-item-factura">Fact: ${item.factura}</span>
      <span class="history-item-monto">${item.monto !== '---' ? 'Bs. ' + item.monto : '---'}</span>
      <span class="history-item-status ${STATUS_CLASSES[st] || ''}">${STATUS_LABELS[st] || st}</span>
      <button class="history-item-delete" data-record-id="${item.id}" title="Eliminar factura"></button>
    </div>
  `;
  }).join('');

  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('history-item-delete')) return;
      const index = parseInt(item.dataset.index);
      const entry = state.records[index];
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

  document.querySelectorAll('.history-item-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.pendingDeleteId = parseInt(btn.dataset.recordId);
      const record = state.records.find(r => r.id === state.pendingDeleteId);
      elements.modalConfirmText.textContent = `¿Eliminar factura ${record ? record.factura : ''}?`;
      elements.modalConfirm.style.display = 'flex';
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

async function saveCurrentEdit() {
  if (!state.currentData) return;
  await ipcRenderer.invoke('db:update-invoice-fields', {
    id: state.currentData.id,
    fields: {
      nit: state.currentData.nit,
      monto: state.currentData.monto,
      factura: state.currentData.factura,
      autorizacion: state.currentData.autorizacion
    }
  });
  for (let i = 0; i < state.records.length; i++) {
    if (state.records[i].id === state.currentData.id) {
      state.records[i] = { ...state.currentData };
      break;
    }
  }
  renderHistory();
}

function makeToggleEdit(inputEl, btnEl, stateKey, fieldKey) {
  return async function() {
    if (state[stateKey]) {
      inputEl.readOnly = true;
      inputEl.classList.remove('editing');
      btnEl.textContent = 'EDITAR';
      btnEl.classList.remove('active');
      state[stateKey] = false;
      if (state.currentData) {
        state.currentData[fieldKey] = inputEl.value;
        await saveCurrentEdit();
      }
    } else {
      inputEl.readOnly = false;
      inputEl.classList.add('editing');
      inputEl.focus();
      inputEl.select();
      btnEl.textContent = 'GUARDAR';
      btnEl.classList.add('active');
      state[stateKey] = true;
    }
  };
}

const toggleEditFactura = makeToggleEdit(elements.fieldFactura, elements.btnEditFactura, 'facturaEditing', 'factura');
const toggleEditAutorizacion = makeToggleEdit(elements.fieldAutorizacion, elements.btnEditAutorizacion, 'autorizacionEditing', 'autorizacion');
const toggleEditMonto = makeToggleEdit(elements.fieldMonto, elements.btnEditMonto, 'montoEditing', 'monto');

async function toggleEditNit() {
  if (state.nitEditing) {
    elements.fieldNit.readOnly = true;
    elements.fieldNit.classList.remove('editing');
    elements.btnEditNit.textContent = 'EDITAR';
    elements.btnEditNit.classList.remove('active');
    state.nitEditing = false;

    if (state.currentData) {
      state.currentData.nit = elements.fieldNit.value;
      await saveCurrentEdit();
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
  if (state.records.length === 0) return;

  const hasCreds = await ipcRenderer.invoke('siat:has-credentials');
  if (!hasCreds) {
    elements.siatIdentity.value = '';
    elements.siatEmail.value = '';
    elements.siatPassword.value = '';
    openSiatModal('Debe registrar sus credenciales SIAT antes de subir', true);
    return;
  }

  const invoices = state.records.map(item => ({
    autorizacion: item.autorizacion,
    factura: item.factura,
    nit: item.nit,
    monto: item.monto
  }));

  elements.btnUpload.textContent = 'SUBIENDO...';
  elements.btnUpload.classList.add('uploading');
  elements.btnUpload.disabled = true;
  setFieldStatus(`Subiendo ${invoices.length} factura(s) de ${EMPRESA_LABELS[state.selectedEmpresa]} a SIAT...`, '');

  const result = await ipcRenderer.invoke('siat:upload-batch', invoices);

  elements.btnUpload.textContent = 'SUBIR A SIAT';
  elements.btnUpload.classList.remove('uploading');
  elements.btnUpload.disabled = false;

  if (result.success) {
    setFieldStatus(`¡${invoices.length} factura(s) subida(s) correctamente!`, 'uploaded');
  } else {
    setFieldStatus('ERROR: ' + (result.error || 'Error al subir'), '');
  }
}

function openSiatModal(message, isError) {
  elements.modalSiat.style.display = 'flex';
  elements.modalStatus.textContent = message || '';
  elements.modalStatus.className = 'modal-status' + (isError ? ' error' : '');
  elements.siatIdentity.focus();
}

function closeSiatModal() {
  elements.modalSiat.style.display = 'none';
}

async function injectTestData() {
  const fakeInvoices = await ipcRenderer.invoke('siat:get-fake');
  for (const inv of fakeInvoices) {
    await ipcRenderer.invoke('db:save-invoice', inv);
  }
  await loadRecords(state.selectedEmpresa);
  if (fakeInvoices.length > 0) {
    const last = fakeInvoices[fakeInvoices.length - 1];
    elements.fieldAutorizacion.value = last.autorizacion;
    elements.fieldFactura.value = last.factura;
    elements.fieldNit.value = last.nit;
    elements.fieldMonto.value = last.monto;
    state.currentData = { ...last };
    elements.btnUpload.disabled = false;
    setFieldStatus('Datos de prueba cargados', 'scanned');
  }
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
elements.btnEditFactura.addEventListener('click', toggleEditFactura);
elements.btnEditAutorizacion.addEventListener('click', toggleEditAutorizacion);
elements.btnEditMonto.addEventListener('click', toggleEditMonto);
elements.btnSelectCamera.addEventListener('click', openCameraPicker);
elements.cameraModalClose.addEventListener('click', closeCameraPicker);
elements.cameraModal.addEventListener('click', (e) => {
  if (e.target === elements.cameraModal) closeCameraPicker();
});
document.querySelector('.camera-option-auto').addEventListener('click', () => selectCamera(null));

elements.btnSiatSettings.addEventListener('click', async () => {
  const creds = await ipcRenderer.invoke('siat:get-credentials');
  if (creds) {
    elements.siatIdentity.value = creds.identity || '';
    elements.siatEmail.value = creds.email || '';
    elements.siatPassword.value = creds.password || '';
    openSiatModal('Modificar credenciales');
  } else {
    elements.siatIdentity.value = '';
    elements.siatEmail.value = '';
    elements.siatPassword.value = '';
    openSiatModal('Ingrese sus credenciales SIAT');
  }
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

  const result = await ipcRenderer.invoke('siat:save-credentials', { identity, email, password });
  if (!result.success) {
    elements.modalStatus.textContent = result.error || 'No se pudieron guardar las credenciales';
    elements.modalStatus.className = 'modal-status error';
    return;
  }
  elements.modalStatus.textContent = 'Credenciales guardadas correctamente';
  elements.modalStatus.className = 'modal-status';
  setTimeout(closeSiatModal, 1200);
});

elements.btnTestData.addEventListener('click', injectTestData);
elements.tabEntel.addEventListener('click', () => switchEmpresa('entel'));
elements.tabStatusPending.addEventListener('click', () => switchStatusGroup('pending'));
elements.tabStatusRegistered.addEventListener('click', () => switchStatusGroup('registered'));

elements.btnConfirmOk.addEventListener('click', async () => {
  if (state.pendingDeleteId === null) return;
  await ipcRenderer.invoke('db:delete-invoice', state.pendingDeleteId);
  state.records = state.records.filter(r => r.id !== state.pendingDeleteId);
  if (state.currentData && state.currentData.id === state.pendingDeleteId) {
    state.currentData = null;
  }
  state.pendingDeleteId = null;
  elements.modalConfirm.style.display = 'none';
  renderHistory();
});

function closeConfirmModal() {
  state.pendingDeleteId = null;
  elements.modalConfirm.style.display = 'none';
}

elements.btnConfirmCancel.addEventListener('click', closeConfirmModal);
elements.btnConfirmClose.addEventListener('click', closeConfirmModal);
elements.modalConfirm.addEventListener('click', (e) => {
  if (e.target === elements.modalConfirm) closeConfirmModal();
});

elements.fieldNit.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.nitEditing) {
    toggleEditNit();
  }
});

elements.fieldFactura.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.facturaEditing) {
    toggleEditFactura();
  }
});

elements.fieldAutorizacion.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.autorizacionEditing) {
    toggleEditAutorizacion();
  }
});

elements.fieldMonto.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && state.montoEditing) {
    toggleEditMonto();
  }
});

// IPC Handlers
ipcRenderer.on('siat:progress', (event, progress) => {
  setFieldStatus(progress.message || 'Procesando...', '');
  if (progress.current && progress.total) {
    elements.btnUpload.textContent = `SUBIENDO ${progress.current}/${progress.total}`;
  }
});

ipcRenderer.on('siat:invoice-result', (event, result) => {
  const wasInView = state.records.some(r => r.autorizacion === result.autorizacion && r.factura === result.factura);
  if (wasInView) {
    // El estado cambio (Pending -> OK/Duplicated/Invalid): recargamos para
    // que la factura "se mueva" de Pendientes a Registradas (o viceversa)
    // en vez de solo pintar el badge sobre la lista vieja.
    loadRecords(state.selectedEmpresa);
  }
  if (result.status === 'OK') {
    setFieldStatus(`Factura ${result.factura} subida correctamente`, 'uploaded');
  } else if (result.status === 'Duplicated') {
    setFieldStatus(`Factura ${result.factura} ya estaba registrada en SIAT`, 'uploaded');
  } else {
    setFieldStatus(`Error en factura ${result.factura}: ${result.message || 'Invalida'}`, '');
  }
});

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
switchEmpresa(state.selectedEmpresa);

// El boton TEST inyecta facturas falsas para probar la UI - solo tiene
// sentido en desarrollo, no debe quedar visible en el ejecutable final.
ipcRenderer.invoke('app:is-packaged').then(isPackaged => {
  if (isPackaged) {
    elements.btnTestData.style.display = 'none';
  }
});
